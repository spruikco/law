import type { Review } from "@law/schema";
import { runPipeline } from "./index";
import { classifyDocuments } from "./pass1-classify";
import { extractBundle } from "./pass2-extract";
import { checkCompliance } from "./pass3-compliance";
import { analyseRisk } from "./pass4-risk";
import { composeLetter } from "./pass5-compose";
import type { UploadedDocument } from "./types";
import {
  emit,
  getUploads,
  releaseUploads,
  setStatus,
  updateReview,
} from "../store/reviews";

/**
 * Kick off the pipeline asynchronously for a previously-created review.
 * Persists each pass's output immediately so the UI can show intermediate
 * state if the client refreshes.
 */
export function startPipeline(reviewId: string, opts: { clientName: string }) {
  // Don't await — caller returns to HTTP client immediately
  void runAsync(reviewId, opts).catch(async (err) => {
    console.error(`[pipeline ${reviewId}]`, err);
    try {
      await updateReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emit(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string, opts: { clientName: string }) {
  const uploads = getUploads(reviewId) as UploadedDocument[] | undefined;
  if (!uploads) throw new Error("uploads not found (cache expired?)");

  const emitProgress = (evt: Parameters<typeof emit>[1]) => emit(reviewId, evt);

  try {
    await setStatus(reviewId, "classifying");
    emitProgress({ type: "pass_start", pass: 1, label: "Classifying documents" });
    emitProgress({
      type: "progress",
      pass: 1,
      message: `Sending ${uploads.length} PDF${uploads.length === 1 ? "" : "s"} to Claude Sonnet 4.6…`,
    });
    const documents = await classifyDocuments(uploads);
    await updateReview(reviewId, { documents });
    emitProgress({
      type: "progress",
      pass: 1,
      message: `Classified ${documents.length} document${documents.length === 1 ? "" : "s"}`,
    });
    emitProgress({ type: "pass_done", pass: 1 });

    await setStatus(reviewId, "extracting");
    emitProgress({ type: "pass_start", pass: 2, label: "Extracting structured data" });
    emitProgress({
      type: "progress",
      pass: 2,
      message: "Calling Claude Sonnet 4.6 with parallel tool use (6 extractors)…",
    });
    const extraction = await extractBundle(documents, uploads);
    await updateReview(reviewId, { extraction });
    const scCount = extraction.specialConditions.length;
    emitProgress({
      type: "progress",
      pass: 2,
      message: `Extracted particulars · ${scCount} special condition${scCount === 1 ? "" : "s"}`,
    });
    emitProgress({ type: "pass_done", pass: 2 });

    await setStatus(reviewId, "checking_compliance");
    emitProgress({ type: "pass_start", pass: 3, label: "Running compliance checks" });
    emitProgress({
      type: "progress",
      pass: 3,
      message: "Loading rules and embedding queries against legislation corpus…",
    });
    const compliance = await checkCompliance(extraction, {
      onRuleChecked: (done, total, ruleId) => {
        emitProgress({
          type: "progress",
          pass: 3,
          current: done,
          total,
          message: `Rule ${done}/${total} · ${ruleId}`,
        });
      },
    });
    await updateReview(reviewId, { compliance });
    emitProgress({ type: "pass_done", pass: 3 });

    await setStatus(reviewId, "analysing_risk");
    emitProgress({ type: "pass_start", pass: 4, label: "Analysing risk" });
    emitProgress({
      type: "progress",
      pass: 4,
      message: "Calling Claude Opus 4.6 — this pass takes the longest (~2m)…",
    });
    const risks = await analyseRisk(extraction);
    await updateReview(reviewId, { risks });
    emitProgress({
      type: "progress",
      pass: 4,
      message: `${risks.length} risk finding${risks.length === 1 ? "" : "s"} recorded`,
    });
    emitProgress({ type: "pass_done", pass: 4 });

    await setStatus(reviewId, "composing_letter");
    emitProgress({ type: "pass_start", pass: 5, label: "Composing letter of advice" });
    emitProgress({
      type: "progress",
      pass: 5,
      message: "Streaming letter from Claude Opus 4.6…",
    });
    const letter = await composeLetter({
      extraction,
      compliance,
      risks,
      clientName: opts.clientName,
      onChunk: (text) => emitProgress({ type: "letter_chunk", text }),
    });
    await updateReview(reviewId, { letter, status: "complete" });
    emitProgress({ type: "pass_done", pass: 5 });
  } finally {
    releaseUploads(reviewId);
  }
}

// Also export the sync-return variant for tests / CLI
export { runPipeline };
export type { Review };
