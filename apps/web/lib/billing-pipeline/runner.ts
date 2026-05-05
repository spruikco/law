import { computeBillingTotals } from "./pass1-totals";
import { checkBillingCompliance } from "./pass2-checklist";
import { composeBillingDocument } from "./pass3-compose";
import {
  emitBilling,
  getBillingReview,
  setBillingStatus,
  updateBillingReview,
} from "../store/billing-reviews";

export function startBillingPipeline(reviewId: string) {
  void runAsync(reviewId).catch(async (err) => {
    console.error(`[billing-pipeline ${reviewId}]`, err);
    try {
      await updateBillingReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitBilling(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string) {
  const review = await getBillingReview(reviewId);
  if (!review) throw new Error(`billing ${reviewId} not found`);
  const emit = (evt: Parameters<typeof emitBilling>[1]) => emitBilling(reviewId, evt);

  // --- Pass 1: deterministic totals ---
  await setBillingStatus(reviewId, "computing_totals");
  emit({ type: "pass_start", pass: 1, label: "Computing fee totals, GST, and amount due" });
  const totals = computeBillingTotals(review.input);
  await updateBillingReview(reviewId, { totals });
  emit({
    type: "progress",
    pass: 1,
    message: `Total $${totals.totalIncGst.amount.toFixed(2)} inc GST · due $${totals.amountDue.amount.toFixed(2)}`,
  });
  emit({ type: "pass_done", pass: 1 });

  // --- Pass 2: LPUL Pt 4.3 checklist ---
  await setBillingStatus(reviewId, "checking_compliance");
  emit({ type: "pass_start", pass: 2, label: "Checking LPUL Pt 4.3 compliance" });
  const findings = await checkBillingCompliance(review.input, totals, {
    onRuleChecked: (done, total, ruleId) =>
      emit({
        type: "progress",
        pass: 2,
        current: done,
        total,
        message: `Rule ${done}/${total} · ${ruleId}`,
      }),
  });
  await updateBillingReview(reviewId, { findings });
  emit({
    type: "progress",
    pass: 2,
    message: `${findings.length} rules checked — ${findings.filter((f) => f.status === "fail").length} fail`,
  });
  emit({ type: "pass_done", pass: 2 });

  // --- Pass 3: compose bill + cover ---
  await setBillingStatus(reviewId, "drafting_bill");
  emit({ type: "pass_start", pass: 3, label: "Drafting bill + tax invoice" });
  emit({ type: "progress", pass: 3, message: "Streaming bill document from Claude Opus 4.6…" });
  const document = await composeBillingDocument({
    input: review.input,
    totals,
    findings,
    onChunk: (text) => emit({ type: "letter_chunk", text }),
  });
  await updateBillingReview(reviewId, { document, status: "complete" });
  emit({ type: "pass_done", pass: 3 });
}
