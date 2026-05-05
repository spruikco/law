import { calculateSettlement } from "./pass1-calculate";
import { checkConveyanceCompliance } from "./pass2-checklist";
import { composeSettlementDocument } from "./pass3-compose";
import {
  emitConveyance,
  getConveyanceReview,
  setConveyanceStatus,
  updateConveyanceReview,
} from "../store/conveyance-reviews";

export function startConveyancePipeline(reviewId: string) {
  void runAsync(reviewId).catch(async (err) => {
    console.error(`[conveyance-pipeline ${reviewId}]`, err);
    try {
      await updateConveyanceReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitConveyance(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string) {
  const review = await getConveyanceReview(reviewId);
  if (!review) throw new Error(`conveyance ${reviewId} not found`);
  const emit = (evt: Parameters<typeof emitConveyance>[1]) =>
    emitConveyance(reviewId, evt);

  // --- Pass 1: deterministic adjustments + duty calculation ---
  await setConveyanceStatus(reviewId, "computing_adjustments");
  emit({ type: "pass_start", pass: 1, label: "Computing pro-rata adjustments + stamp duty" });
  const calculation = calculateSettlement(review.input);
  await updateConveyanceReview(reviewId, { calculation });
  emit({
    type: "progress",
    pass: 1,
    message: `${calculation.adjustments.length} adjustment line(s) · duty $${calculation.stampDuty.totalDutyPayable.amount.toFixed(2)} · total at settlement $${calculation.totalAtSettlement.amount.toFixed(2)}`,
  });
  emit({ type: "pass_done", pass: 1 });

  // --- Pass 2: VIC settlement compliance ---
  await setConveyanceStatus(reviewId, "checking_compliance");
  emit({ type: "pass_start", pass: 2, label: "Checking VIC settlement compliance" });
  const findings = await checkConveyanceCompliance(review.input, calculation, {
    onRuleChecked: (done, total, ruleId) =>
      emit({
        type: "progress",
        pass: 2,
        current: done,
        total,
        message: `Rule ${done}/${total} · ${ruleId}`,
      }),
  });
  await updateConveyanceReview(reviewId, { findings });
  emit({
    type: "progress",
    pass: 2,
    message: `${findings.length} rules checked — ${findings.filter((f) => f.status === "fail").length} fail · ${findings.filter((f) => f.status === "warning").length} warning`,
  });
  emit({ type: "pass_done", pass: 2 });

  // --- Pass 3: compose the settlement statement ---
  await setConveyanceStatus(reviewId, "drafting_statement");
  emit({ type: "pass_start", pass: 3, label: "Drafting settlement statement + post-settlement checklist" });
  emit({ type: "progress", pass: 3, message: "Streaming statement from Claude Opus 4.6…" });
  const document = await composeSettlementDocument({
    input: review.input,
    calc: calculation,
    findings,
    onChunk: (text) => emit({ type: "letter_chunk", text }),
  });
  await updateConveyanceReview(reviewId, { document, status: "complete" });
  emit({ type: "pass_done", pass: 3 });
}
