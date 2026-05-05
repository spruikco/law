import { LeaseExtractionBundleSchema } from "@law/schema";
import { classifyLease } from "./pass1-classify";
import { extractLeaseBundle } from "./pass2-extract";
import { checkRlaCompliance } from "./pass3-rla-compliance";
import { checkRlaUnenforceability } from "./pass3b-unenforceability";
import { analyseAdditionalProvisions } from "./pass4-clauses";
import { composeLeaseLetter } from "./pass5-compose";
import { synthesiseCapabilities } from "./pass6-capabilities";
import type { UploadedDocument } from "./types";
import {
  emitLease,
  getLeaseUploads,
  releaseLeaseUploads,
  setLeaseStatus,
  updateLeaseReview,
} from "../store/lease-reviews";

/**
 * Kick off the lease pipeline asynchronously. Persists each pass's output so
 * the UI can show intermediate state on refresh.
 */
export function startLeasePipeline(reviewId: string, opts: { clientName: string }) {
  void runAsync(reviewId, opts).catch(async (err) => {
    console.error(`[lease-pipeline ${reviewId}]`, err);
    try {
      await updateLeaseReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitLease(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string, opts: { clientName: string }) {
  const uploads = getLeaseUploads(reviewId) as UploadedDocument[] | undefined;
  if (!uploads) throw new Error("uploads not found (cache expired?)");

  const emit = (evt: Parameters<typeof emitLease>[1]) => emitLease(reviewId, evt);

  try {
    // --- Pass 1: retail vs non-retail classification ---
    await setLeaseStatus(reviewId, "classifying");
    emit({ type: "pass_start", pass: 1, label: "Classifying retail vs non-retail" });
    emit({
      type: "progress",
      pass: 1,
      message: "Asking Claude Sonnet 4.6 to apply the s4 RLA 2003 test…",
    });
    const classification = await classifyLease(uploads);
    emit({
      type: "progress",
      pass: 1,
      message: `${classification.kind.toUpperCase()} · RLA ${classification.rlaApplies ? "applies" : "does NOT apply"} · confidence ${Math.round(classification.confidence * 100)}%`,
    });
    emit({ type: "pass_done", pass: 1 });

    // --- Pass 2: extract items + make-good + outgoings + ongoing obligations ---
    await setLeaseStatus(reviewId, "extracting");
    emit({ type: "pass_start", pass: 2, label: "Extracting lease items + focus areas" });
    emit({
      type: "progress",
      pass: 2,
      message: "Parallel tool use: items, make-good, outgoings, ongoing obligations…",
    });
    const { items, makeGood, outgoings, ongoingObligations } = await extractLeaseBundle(uploads);

    const extraction = LeaseExtractionBundleSchema.parse({
      classification,
      items,
      additionalProvisions: [],
      makeGood,
      outgoings,
      ongoingObligations,
    });
    await updateLeaseReview(reviewId, { extraction });
    emit({
      type: "progress",
      pass: 2,
      message: `Items extracted · ${outgoings.excessiveItems.length} non-standard outgoing${outgoings.excessiveItems.length === 1 ? "" : "s"} · make-good: ${makeGood.severityRating ?? "n/a"}`,
    });
    emit({ type: "pass_done", pass: 2 });

    // --- Pass 3: RLA compliance (retail only) ---
    await setLeaseStatus(reviewId, "checking_compliance");
    emit({
      type: "pass_start",
      pass: 3,
      label: classification.rlaApplies
        ? "Checking RLA 2003 compliance"
        : "RLA compliance (skipped — non-retail)",
    });
    let rlaCompliance: Awaited<ReturnType<typeof checkRlaCompliance>> = [];
    if (classification.rlaApplies) {
      emit({
        type: "progress",
        pass: 3,
        message: "Loading RLA rules and embedding queries against legislation corpus…",
      });
      rlaCompliance = await checkRlaCompliance(extraction, {
        onRuleChecked: (done, total, ruleId) =>
          emit({
            type: "progress",
            pass: 3,
            current: done,
            total,
            message: `Rule ${done}/${total} · ${ruleId}`,
          }),
      });
      await updateLeaseReview(reviewId, { rlaCompliance });
    } else {
      emit({
        type: "progress",
        pass: 3,
        message: "Lease is non-retail — RLA protections do not apply. Skipping compliance pass.",
      });
    }
    emit({ type: "pass_done", pass: 3 });

    // --- Pass 3b: RLA unenforceability — landlord non-compliance voids clauses ---
    // Emit as pass 3 (same stepper stage as compliance).
    let unenforceability: Awaited<ReturnType<typeof checkRlaUnenforceability>> = [];
    if (classification.rlaApplies) {
      emit({
        type: "progress",
        pass: 3,
        message: "Loading unenforceability rule pack — these are the high-value findings…",
      });
      unenforceability = await checkRlaUnenforceability(extraction, {
        onRuleChecked: (done, total, ruleId) =>
          emit({
            type: "progress",
            pass: 3,
            current: done,
            total,
            message: `Unenforceability rule ${done}/${total} · ${ruleId}`,
          }),
      });
      await updateLeaseReview(reviewId, { unenforceability });
      emit({
        type: "progress",
        pass: 3,
        message: `${unenforceability.length} unenforceability finding${unenforceability.length === 1 ? "" : "s"}`,
      });
    }

    // --- Pass 4: clause-by-clause analysis + tenant-favouring amendments ---
    await setLeaseStatus(reviewId, "analysing_clauses");
    emit({ type: "pass_start", pass: 4, label: "Analysing clauses + proposing amendments" });
    emit({
      type: "progress",
      pass: 4,
      message: "Calling Claude Opus 4.6 — this pass takes the longest (~2m)…",
    });
    const additionalProvisions = await analyseAdditionalProvisions(uploads, {
      classification,
      items,
      makeGood,
      outgoings,
      ongoingObligations,
    });
    const extractionWithProvisions = { ...extraction, additionalProvisions };
    await updateLeaseReview(reviewId, { extraction: extractionWithProvisions });
    emit({
      type: "progress",
      pass: 4,
      message: `${additionalProvisions.length} provision${additionalProvisions.length === 1 ? "" : "s"} analysed · ${additionalProvisions.filter((p) => p.classification !== "standard").length} non-standard`,
    });
    emit({ type: "pass_done", pass: 4 });

    // --- Pass 6: capability synthesis (caps 2, 3, 4, 7, 8, 9, 10, 11) ---
    // Emit as stepper stage 5 (synthesising_capabilities).
    await setLeaseStatus(reviewId, "synthesising_capabilities");
    emit({
      type: "pass_start",
      pass: 5,
      label: "Synthesising forecasts, options, planning, notifications, lease chain",
    });
    emit({
      type: "progress",
      pass: 5,
      message: "Computing make-good band, market projections, option analyses, planning…",
    });
    const caps = await synthesiseCapabilities({
      uploads,
      bundle: extractionWithProvisions,
    });
    await updateLeaseReview(reviewId, {
      marketReviewProjections: caps.marketReviewProjections,
      notificationObligations: caps.notificationObligations,
      optionAnalysis: caps.optionAnalysis,
      planning: caps.planning,
      commentaryRisks: caps.commentaryRisks,
      leaseChain: caps.leaseChain,
      extraction: {
        ...extractionWithProvisions,
        makeGoodCostBand: caps.makeGoodCostBand,
        livVersion: caps.livVersion,
      },
    });
    emit({
      type: "progress",
      pass: 5,
      message: `${caps.optionAnalysis.length} option(s) · ${caps.notificationObligations.length} notification obligation(s) · ${caps.marketReviewProjections.length} review projection(s)`,
    });
    emit({ type: "pass_done", pass: 5 });

    // --- Pass 5: compose letter --- (stepper stage 6)
    await setLeaseStatus(reviewId, "composing_letter");
    emit({ type: "pass_start", pass: 6, label: "Composing letter of advice" });
    emit({
      type: "progress",
      pass: 6,
      message: "Streaming letter from Claude Opus 4.6…",
    });
    const letter = await composeLeaseLetter({
      extraction: {
        ...extractionWithProvisions,
        makeGoodCostBand: caps.makeGoodCostBand,
        livVersion: caps.livVersion,
      },
      rlaCompliance,
      unenforceability,
      capabilities: caps,
      clientName: opts.clientName,
      onChunk: (text) => emit({ type: "letter_chunk", text }),
    });
    await updateLeaseReview(reviewId, { letter, status: "complete" });
    emit({ type: "pass_done", pass: 6 });
  } finally {
    releaseLeaseUploads(reviewId);
  }
}
