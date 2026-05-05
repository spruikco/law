import { checkCostDisclosure } from "./pass1-checklist";
import { composeCostDisclosure } from "./pass2-compose";
import {
  emitCostDisclosure,
  getCostDisclosureReview,
  setCostDisclosureStatus,
  updateCostDisclosureReview,
} from "../store/cost-disclosure-reviews";

export function startCostDisclosurePipeline(reviewId: string) {
  void runAsync(reviewId).catch(async (err) => {
    console.error(`[cost-disclosure-pipeline ${reviewId}]`, err);
    try {
      await updateCostDisclosureReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitCostDisclosure(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string) {
  const review = await getCostDisclosureReview(reviewId);
  if (!review) throw new Error(`cost-disclosure ${reviewId} not found`);
  const emit = (evt: Parameters<typeof emitCostDisclosure>[1]) =>
    emitCostDisclosure(reviewId, evt);

  // --- Pass 1: checklist ---
  await setCostDisclosureStatus(reviewId, "checking_compliance");
  emit({ type: "pass_start", pass: 1, label: "Checking LPUL s 174 mandatory elements" });
  const findings = await checkCostDisclosure(review.input, {
    onRuleChecked: (done, total, ruleId) =>
      emit({
        type: "progress",
        pass: 1,
        current: done,
        total,
        message: `Element ${done}/${total} · ${ruleId}`,
      }),
  });
  await updateCostDisclosureReview(reviewId, { findings });
  emit({
    type: "progress",
    pass: 1,
    message: `${findings.length} elements checked — ${findings.filter((f) => f.status === "fail").length} fail`,
  });
  emit({ type: "pass_done", pass: 1 });

  // --- Pass 2: compose ---
  await setCostDisclosureStatus(reviewId, "drafting_letter");
  emit({ type: "pass_start", pass: 2, label: "Drafting cost disclosure letter" });
  emit({ type: "progress", pass: 2, message: "Streaming letter from Claude Opus 4.6…" });
  const letter = await composeCostDisclosure({
    input: review.input,
    findings,
    onChunk: (text) => emit({ type: "letter_chunk", text }),
  });
  await updateCostDisclosureReview(reviewId, { letter, status: "complete" });
  emit({ type: "pass_done", pass: 2 });
}
