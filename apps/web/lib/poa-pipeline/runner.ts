import { classifyPoa } from "./pass1-classify";
import { extractPoa } from "./pass2-extract";
import { checkPoaValidity } from "./pass3-validity";
import { detectPoaRedFlags } from "./pass4-red-flags";
import { composePoaLetter } from "./pass5-compose";
import type { UploadedDocument } from "./types";
import {
  emitPoa,
  getPoaUploads,
  releasePoaUploads,
  setPoaStatus,
  updatePoaReview,
} from "../store/poa-reviews";

export function startPoaPipeline(
  reviewId: string,
  opts: {
    clientName: string;
    clientRole?: "principal" | "attorney" | "interested_party";
  },
) {
  void runAsync(reviewId, opts).catch(async (err) => {
    console.error(`[poa-pipeline ${reviewId}]`, err);
    try {
      await updatePoaReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitPoa(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(
  reviewId: string,
  opts: {
    clientName: string;
    clientRole?: "principal" | "attorney" | "interested_party";
  },
) {
  const uploads = getPoaUploads(reviewId) as UploadedDocument[] | undefined;
  if (!uploads) throw new Error("uploads not found (cache expired?)");
  const emit = (evt: Parameters<typeof emitPoa>[1]) => emitPoa(reviewId, evt);

  try {
    // --- Pass 1: classify ---
    await setPoaStatus(reviewId, "classifying");
    emit({
      type: "pass_start",
      pass: 1,
      label: "Classifying — kind, scope, prescribed-form, appointment mode",
    });
    emit({
      type: "progress",
      pass: 1,
      message: "Asking Claude Sonnet 4.6 to apply PoA Act 2014 (Vic) tests…",
    });
    const classification = await classifyPoa(uploads);
    emit({
      type: "progress",
      pass: 1,
      message: `${classification.kind.toUpperCase().replace(/_/g, " ")} · enduring ${classification.isEnduring ? "YES" : "no"} · prescribed form ${classification.formIsStatutoryPrescribed ? "YES" : "no"} · ${classification.multipleAttorneys ? `${classification.appointmentMode} attorneys` : "single attorney"} · confidence ${Math.round(classification.confidence * 100)}%`,
    });
    emit({ type: "pass_done", pass: 1 });

    // --- Pass 2: extract parties / witnesses / scope / authorisations ---
    await setPoaStatus(reviewId, "extracting");
    emit({
      type: "pass_start",
      pass: 2,
      label: "Extracting parties, witnesses, scope, gift / conflict authorisations",
    });
    emit({
      type: "progress",
      pass: 2,
      message: "Reading the instrument — principal, attorneys, witnesses, execution…",
    });
    const extraction = await extractPoa(uploads, classification);
    await updatePoaReview(reviewId, { extraction });
    emit({
      type: "progress",
      pass: 2,
      message: `Principal · ${extraction.attorneys.length} attorney${extraction.attorneys.length === 1 ? "" : "s"} · ${extraction.witnesses.length} witness${extraction.witnesses.length === 1 ? "" : "es"} · ${extraction.giftAuthorisations.length} gift clause${extraction.giftAuthorisations.length === 1 ? "" : "s"} · ${extraction.conflictTransactionAuthorisations.length} conflict clause${extraction.conflictTransactionAuthorisations.length === 1 ? "" : "s"}`,
    });
    emit({ type: "pass_done", pass: 2 });

    // --- Pass 3: validity / compliance ---
    await setPoaStatus(reviewId, "checking_validity");
    emit({
      type: "pass_start",
      pass: 3,
      label: "Checking PoA Act 2014 (Vic) validity rules — s22, s31, s33, s35, s41, s44, s64, s65",
    });
    const validity = await checkPoaValidity(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 3,
          current: done,
          total,
          message: `Validity rule ${done}/${total} · ${ruleId}`,
        }),
    });
    await updatePoaReview(reviewId, { compliance: validity });
    const fails = validity.filter((v) => v.status === "fail").length;
    const warns = validity.filter((v) => v.status === "warning").length;
    emit({
      type: "progress",
      pass: 3,
      message: `${validity.length} validity findings — ${fails} fail · ${warns} warning · ${validity.filter((v) => v.status === "needs_review").length} needs review`,
    });
    emit({ type: "pass_done", pass: 3 });

    // --- Pass 4: red flags (equity / fiduciary / abuse) ---
    await setPoaStatus(reviewId, "detecting_red_flags");
    emit({
      type: "pass_start",
      pass: 4,
      label: "Detecting equity / fiduciary / elder-abuse red flags",
    });
    const redFlags = await detectPoaRedFlags(extraction, {
      onRuleChecked: (done, total, ruleId) =>
        emit({
          type: "progress",
          pass: 4,
          current: done,
          total,
          message: `Red-flag rule ${done}/${total} · ${ruleId}`,
        }),
    });
    await updatePoaReview(reviewId, { redFlags });
    const critical = redFlags.filter((r) => r.severity === "critical").length;
    emit({
      type: "progress",
      pass: 4,
      message: `${redFlags.length} red flag${redFlags.length === 1 ? "" : "s"} flagged${critical ? ` · ${critical} critical` : ""}`,
    });
    emit({ type: "pass_done", pass: 4 });

    // --- Pass 5: compose letter ---
    await setPoaStatus(reviewId, "composing_letter");
    emit({ type: "pass_start", pass: 5, label: "Composing letter of advice" });
    emit({
      type: "progress",
      pass: 5,
      message: "Streaming letter from Claude Opus 4.6…",
    });
    const letter = await composePoaLetter({
      extraction,
      validity,
      redFlags,
      clientName: opts.clientName,
      clientRole: opts.clientRole,
      onChunk: (text) => emit({ type: "letter_chunk", text }),
    });
    await updatePoaReview(reviewId, { letter, status: "complete" });
    emit({ type: "pass_done", pass: 5 });
  } finally {
    releasePoaUploads(reviewId);
  }
}
