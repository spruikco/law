import type { BillingInput, BillingTotals, Money } from "@law/schema";

const GST_RATE = 0.1;

function aud(amount: number): Money {
  return { amount: Math.round(amount * 100) / 100, currency: "AUD" };
}

/**
 * Pure deterministic totals calculation. No model call.
 *
 * Order of operations:
 *   1. fees subtotal = sum(feeItems.amount)
 *   2. uplift amount = fees * (uplift% / 100), only if conditional + applied
 *   3. disbursements split into GST-able + non-GST-able
 *   4. subtotal_ex_gst = fees + uplift + disbursementsAll
 *   5. GST = (fees + uplift) * 10% + disbursementsGstable * 10%
 *   6. total_inc_gst = subtotal_ex_gst + GST
 *   7. amount_due = total_inc_gst - trustOffset - priorPaid
 */
export function computeBillingTotals(input: BillingInput): BillingTotals {
  const feesSubtotal = input.feeItems.reduce((s, l) => s + l.amount.amount, 0);

  const upliftAmount =
    input.isConditional && input.upliftAppliedToFees && input.upliftPercent
      ? feesSubtotal * (input.upliftPercent / 100)
      : 0;

  let disbursementsGstable = 0;
  let disbursementsNonGstable = 0;
  for (const d of input.disbursements) {
    if (d.gstApplicable) disbursementsGstable += d.amount.amount;
    else disbursementsNonGstable += d.amount.amount;
  }
  const disbursementsSubtotal = disbursementsGstable + disbursementsNonGstable;

  const feesPlusUplift = feesSubtotal + upliftAmount;
  const subtotalExGst = feesPlusUplift + disbursementsSubtotal;
  const gst = feesPlusUplift * GST_RATE + disbursementsGstable * GST_RATE;
  const totalIncGst = subtotalExGst + gst;

  const trustOffset =
    input.willWithdrawFromTrust && input.trustBalance
      ? Math.min(input.trustBalance.amount, totalIncGst)
      : 0;

  const priorPaid = input.priorBills.reduce((s, b) => s + b.paid.amount, 0);

  const amountDue = Math.max(0, totalIncGst - trustOffset - priorPaid);

  return {
    feesSubtotal: aud(feesSubtotal),
    upliftAmount: upliftAmount > 0 ? aud(upliftAmount) : undefined,
    disbursementsSubtotal: aud(disbursementsSubtotal),
    disbursementsGstable: aud(disbursementsGstable),
    disbursementsNonGstable: aud(disbursementsNonGstable),
    subtotalExGst: aud(subtotalExGst),
    gst: aud(gst),
    totalIncGst: aud(totalIncGst),
    trustOffset: trustOffset > 0 ? aud(trustOffset) : undefined,
    priorPaid: priorPaid > 0 ? aud(priorPaid) : undefined,
    amountDue: aud(amountDue),
  };
}
