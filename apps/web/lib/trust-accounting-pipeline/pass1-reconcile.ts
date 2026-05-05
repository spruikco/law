import type {
  LedgerBalance,
  Money,
  TrustAccountInput,
  TrustReconciliation,
} from "@law/schema";

const aud = (n: number): Money => ({
  amount: Math.round(n * 100) / 100,
  currency: "AUD",
});

const sumMoney = (xs: Array<{ amount: Money }>): number =>
  xs.reduce((s, x) => s + x.amount.amount, 0);

const sumPaymentsForLedger = (input: TrustAccountInput, ledgerName: string): number =>
  input.payments
    .filter((p) => p.ledgerName === ledgerName)
    .reduce((s, p) => s + p.amount.amount, 0);

const sumReceiptsForLedger = (input: TrustAccountInput, ledgerName: string): number =>
  input.receipts
    .filter((r) => r.ledgerName === ledgerName)
    .reduce((s, r) => s + r.amount.amount, 0);

const sumTransfersForLedger = (
  input: TrustAccountInput,
  ledgerName: string,
  direction: "in" | "out",
): number =>
  input.transfers
    .filter((t) => (direction === "in" ? t.toLedger : t.fromLedger) === ledgerName)
    .reduce((s, t) => s + t.amount.amount, 0);

/**
 * Pure deterministic reconciliation.
 *
 * Cashbook side:
 *   closing = opening + receipts - payments
 *   (transfers internal to the trust account net to zero on the cashbook)
 *
 * Bank side:
 *   reconciled = bank_closing - unpresented_cheques + outstanding_deposits
 *
 * Reconciles iff cashbookClosing == reconciledBank within 0.005.
 *
 * Trial balance:
 *   per-ledger closing = ledger_opening + receipts - payments + transfersIn - transfersOut
 *   trialBalanceTotal = sum(ledgerClosings)
 *   coherent iff trialBalanceTotal == cashbookClosing.
 *
 * Overdrawn ledger detection: any ledger with closingBalance < -0.005.
 */
export function reconcileTrust(input: TrustAccountInput): TrustReconciliation {
  const cashbookOpening = input.openingTrustBalance.amount;
  const receiptsTotal = sumMoney(input.receipts);
  const paymentsTotal = sumMoney(input.payments);
  const cashbookClosing = cashbookOpening + receiptsTotal - paymentsTotal;

  const bankClosing = input.bankStatement.closingBalance.amount;
  const unpresentedTotal = input.bankStatement.unpresentedCheques.reduce(
    (s, c) => s + c.amount.amount,
    0,
  );
  const outstandingDepositsTotal = input.bankStatement.outstandingDeposits.reduce(
    (s, d) => s + d.amount.amount,
    0,
  );
  const reconciledBank = bankClosing - unpresentedTotal + outstandingDepositsTotal;
  const reconciliationDifference = cashbookClosing - reconciledBank;

  // Per-ledger trial balance
  const ledgerNames = new Set<string>();
  for (const o of input.ledgerOpeningBalances) ledgerNames.add(o.ledgerName);
  for (const r of input.receipts) ledgerNames.add(r.ledgerName);
  for (const p of input.payments) ledgerNames.add(p.ledgerName);
  for (const t of input.transfers) {
    ledgerNames.add(t.fromLedger);
    ledgerNames.add(t.toLedger);
  }

  const ledgerBalances: LedgerBalance[] = [];
  for (const name of ledgerNames) {
    const opening = input.ledgerOpeningBalances.find((o) => o.ledgerName === name);
    const matterRef =
      opening?.matterRef ??
      input.receipts.find((r) => r.ledgerName === name)?.matterRef ??
      input.payments.find((p) => p.ledgerName === name)?.matterRef ??
      "(unknown)";
    const openingBal = opening?.openingBalance.amount ?? 0;
    const recs = sumReceiptsForLedger(input, name);
    const pays = sumPaymentsForLedger(input, name);
    const tIn = sumTransfersForLedger(input, name, "in");
    const tOut = sumTransfersForLedger(input, name, "out");
    const closing = openingBal + recs - pays + tIn - tOut;
    ledgerBalances.push({
      ledgerName: name,
      matterRef,
      openingBalance: aud(openingBal),
      receipts: aud(recs),
      payments: aud(pays),
      transfersIn: aud(tIn),
      transfersOut: aud(tOut),
      closingBalance: aud(closing),
      isOverdrawn: closing < -0.005,
    });
  }

  const trialBalanceTotal = ledgerBalances.reduce(
    (s, l) => s + l.closingBalance.amount,
    0,
  );
  const trialVsCashbookDifference = trialBalanceTotal - cashbookClosing;

  const reconciles =
    Math.abs(reconciliationDifference) < 0.005 &&
    Math.abs(trialVsCashbookDifference) < 0.005;

  return {
    cashbookOpeningBalance: aud(cashbookOpening),
    cashbookReceiptsTotal: aud(receiptsTotal),
    cashbookPaymentsTotal: aud(paymentsTotal),
    cashbookClosingBalance: aud(cashbookClosing),
    bankClosingBalance: aud(bankClosing),
    unpresentedTotal: aud(unpresentedTotal),
    outstandingDepositsTotal: aud(outstandingDepositsTotal),
    reconciledBankBalance: aud(reconciledBank),
    trialBalanceTotal: aud(trialBalanceTotal),
    reconciliationDifference: aud(reconciliationDifference),
    trialVsCashbookDifference: aud(trialVsCashbookDifference),
    reconciles,
    ledgerBalances,
    overdrawnLedgers: ledgerBalances.filter((l) => l.isOverdrawn),
  };
}
