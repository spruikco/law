import { reconcileTrust } from "./pass1-reconcile";
import { checkTrustCompliance } from "./pass2-checklist";
import { composeTrustPack } from "./pass3-compose";
import {
  emitTrustAccount,
  getTrustAccountReview,
  setTrustAccountStatus,
  updateTrustAccountReview,
} from "../store/trust-accounting-reviews";

export function startTrustAccountPipeline(reviewId: string) {
  void runAsync(reviewId).catch(async (err) => {
    console.error(`[trust-accounting-pipeline ${reviewId}]`, err);
    try {
      await updateTrustAccountReview(reviewId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // best-effort
    }
    emitTrustAccount(reviewId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAsync(reviewId: string) {
  const review = await getTrustAccountReview(reviewId);
  if (!review) throw new Error(`trust-accounting ${reviewId} not found`);
  const emit = (evt: Parameters<typeof emitTrustAccount>[1]) =>
    emitTrustAccount(reviewId, evt);

  // --- Pass 1: deterministic reconciliation ---
  await setTrustAccountStatus(reviewId, "reconciling");
  emit({ type: "pass_start", pass: 1, label: "Reconciling cashbook against bank + trust trial balance" });
  const reconciliation = reconcileTrust(review.input);
  await updateTrustAccountReview(reviewId, { reconciliation });
  emit({
    type: "progress",
    pass: 1,
    message: `${reconciliation.reconciles ? "Reconciled" : "DOES NOT BALANCE"} · cashbook closing $${reconciliation.cashbookClosingBalance.amount.toFixed(2)} · ${reconciliation.overdrawnLedgers.length} overdrawn ledger(s)`,
  });
  emit({ type: "pass_done", pass: 1 });

  // --- Pass 2: LPUL + LPUGR compliance ---
  await setTrustAccountStatus(reviewId, "checking_compliance");
  emit({ type: "pass_start", pass: 2, label: "Checking LPUL Pt 4.2 + LPUGR compliance" });
  const findings = await checkTrustCompliance(review.input, reconciliation, {
    onRuleChecked: (done, total, ruleId) =>
      emit({
        type: "progress",
        pass: 2,
        current: done,
        total,
        message: `Rule ${done}/${total} · ${ruleId}`,
      }),
  });
  await updateTrustAccountReview(reviewId, { findings });
  emit({
    type: "progress",
    pass: 2,
    message: `${findings.length} rules checked — ${findings.filter((f) => f.status === "fail").length} fail`,
  });
  emit({ type: "pass_done", pass: 2 });

  // --- Pass 3: compose monthly pack ---
  await setTrustAccountStatus(reviewId, "drafting_pack");
  emit({ type: "pass_start", pass: 3, label: "Drafting monthly trust compliance pack" });
  emit({ type: "progress", pass: 3, message: "Streaming pack from Claude Opus 4.6…" });
  const pack = await composeTrustPack({
    input: review.input,
    reconciliation,
    findings,
    onChunk: (text) => emit({ type: "letter_chunk", text }),
  });
  await updateTrustAccountReview(reviewId, { pack, status: "complete" });
  emit({ type: "pass_done", pass: 3 });
}
