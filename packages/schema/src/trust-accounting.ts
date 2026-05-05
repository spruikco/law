import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

/**
 * Trust accounting monthly compliance under LPUL Pt 4.2 + Legal Profession
 * Uniform General Rules 2015 (LPUGR) Pt 4.2 Div 6.
 *
 * Each month a law practice that holds trust money must:
 *   - issue trust receipts immediately on receipt of trust money (LPUGR r 35)
 *   - keep a receipts cashbook, payments cashbook, trust ledger (rr 47-50)
 *   - prepare a monthly trust trial balance (r 52) and a monthly bank
 *     reconciliation (r 53) within 15 working days of month end
 *   - never overdraw a trust ledger account (LPUL s 145 / LPUGR r 50(5))
 *   - never mix trust money with general money (LPUL s 144)
 *   - withdraw trust money only as authorised (LPUL ss 145, 150-152)
 *
 * The supervising solicitor signs off on the trust trial balance, the bank
 * reconciliation, and the breach register before the LSC-prescribed deadlines.
 */

// ---------- Trust receipt + payment + transfer ----------

export const TrustReceiptKindSchema = z.enum([
  "general_trust",
  "controlled_money",
  "transit_money",
  "power_money",
]);
export type TrustReceiptKind = z.infer<typeof TrustReceiptKindSchema>;

export const TrustReceiptSchema = z.object({
  id: z.string(),
  kind: TrustReceiptKindSchema.default("general_trust"),
  matterRef: z.string(),
  ledgerName: z.string().describe("Client/matter ledger heading"),
  receivedFrom: z.string(),
  receivedOn: z.string().describe("ISO date"),
  amount: MoneySchema,
  paymentMethod: z.enum(["cheque", "eft", "cash", "trust_to_trust", "other"]),
  description: z.string(),
  receiptNumber: z.string().describe("LPUGR r 36 — sequential receipt number"),
  receiptIssuedAt: z.string().optional().describe("ISO datetime the receipt was given to the depositor"),
});
export type TrustReceipt = z.infer<typeof TrustReceiptSchema>;

export const TrustPaymentSchema = z.object({
  id: z.string(),
  matterRef: z.string(),
  ledgerName: z.string(),
  paidTo: z.string(),
  paidOn: z.string(),
  amount: MoneySchema,
  method: z.enum(["cheque", "eft", "trust_to_trust", "other"]),
  reference: z.string().describe("LPUGR r 38 — sequential payment reference"),
  authority: z.enum([
    "client_written_direction",
    "court_order",
    "bill_given_s152",
    "transfer_to_controlled",
    "other",
  ]),
  description: z.string(),
  billNumber: z.string().optional().describe("If authority=bill_given_s152"),
});
export type TrustPayment = z.infer<typeof TrustPaymentSchema>;

export const TrustTransferSchema = z.object({
  id: z.string(),
  fromLedger: z.string(),
  toLedger: z.string(),
  amount: MoneySchema,
  transferredOn: z.string(),
  description: z.string(),
  authority: z.enum(["client_written_direction", "court_order", "bill_given_s152", "other"]),
});
export type TrustTransfer = z.infer<typeof TrustTransferSchema>;

// ---------- Bank statement + opening ----------

export const BankStatementSummarySchema = z.object({
  bankName: z.string(),
  bsb: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  openingBalance: MoneySchema,
  closingBalance: MoneySchema,
  totalCredits: MoneySchema,
  totalDebits: MoneySchema,
  unpresentedCheques: z.array(z.object({ ref: z.string(), amount: MoneySchema })).default([]),
  outstandingDeposits: z.array(z.object({ ref: z.string(), amount: MoneySchema })).default([]),
});
export type BankStatementSummary = z.infer<typeof BankStatementSummarySchema>;

// ---------- Inputs ----------

export const TrustAccountInputSchema = z.object({
  jurisdiction: Jurisdiction.default("VIC"),
  practice: z.object({
    name: z.string(),
    abn: z.string().optional(),
    address: z.string(),
    principalSolicitor: z.string(),
    trustAuthorisedSolicitorName: z.string().describe("LPUL s 144(2) authorised principal"),
    externalExaminerName: z.string().optional(),
    externalExaminerLastReportDate: z.string().optional(),
  }),
  periodStart: z.string().describe("ISO date — first day of period (usually month start)"),
  periodEnd: z.string().describe("ISO date — last day of period"),
  openingTrustBalance: MoneySchema,
  bankStatement: BankStatementSummarySchema,
  receipts: z.array(TrustReceiptSchema).default([]),
  payments: z.array(TrustPaymentSchema).default([]),
  transfers: z.array(TrustTransferSchema).default([]),
  // Per-matter opening balances (used for ledger trial balance):
  ledgerOpeningBalances: z
    .array(
      z.object({
        ledgerName: z.string(),
        matterRef: z.string(),
        openingBalance: MoneySchema,
      }),
    )
    .default([]),
});
export type TrustAccountInput = z.infer<typeof TrustAccountInputSchema>;

// ---------- Reconciliation results ----------

export const LedgerBalanceSchema = z.object({
  ledgerName: z.string(),
  matterRef: z.string(),
  openingBalance: MoneySchema,
  receipts: MoneySchema,
  payments: MoneySchema,
  transfersIn: MoneySchema,
  transfersOut: MoneySchema,
  closingBalance: MoneySchema,
  isOverdrawn: z.boolean().describe("LPUL s 145 / LPUGR r 50(5) breach if true"),
});
export type LedgerBalance = z.infer<typeof LedgerBalanceSchema>;

export const TrustReconciliationSchema = z.object({
  cashbookOpeningBalance: MoneySchema,
  cashbookReceiptsTotal: MoneySchema,
  cashbookPaymentsTotal: MoneySchema,
  cashbookClosingBalance: MoneySchema,
  bankClosingBalance: MoneySchema,
  unpresentedTotal: MoneySchema,
  outstandingDepositsTotal: MoneySchema,
  reconciledBankBalance: MoneySchema.describe(
    "bank closing - unpresented + outstanding deposits",
  ),
  trialBalanceTotal: MoneySchema.describe("sum of all ledger closing balances"),
  reconciliationDifference: MoneySchema.describe(
    "cashbook closing - reconciled bank balance; should be zero",
  ),
  trialVsCashbookDifference: MoneySchema.describe(
    "trialBalanceTotal - cashbookClosingBalance; should be zero",
  ),
  reconciles: z.boolean(),
  ledgerBalances: z.array(LedgerBalanceSchema),
  overdrawnLedgers: z.array(LedgerBalanceSchema),
});
export type TrustReconciliation = z.infer<typeof TrustReconciliationSchema>;

// ---------- Compliance findings ----------

export const TrustComplianceFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional(),
});
export type TrustComplianceFinding = z.infer<typeof TrustComplianceFindingSchema>;

// ---------- Compliance pack document ----------

export const TrustPackSectionId = z.enum([
  "header",
  "trial_balance",
  "bank_reconciliation",
  "receipts_journal",
  "payments_journal",
  "transfers_journal",
  "breach_register",
  "principal_certification",
]);
export type TrustPackSectionId = z.infer<typeof TrustPackSectionId>;

export const TrustPackSectionSchema = z.object({
  id: TrustPackSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const TrustPackSchema = z.object({
  date: z.string(),
  sections: z.array(TrustPackSectionSchema),
});
export type TrustPack = z.infer<typeof TrustPackSchema>;

// ---------- Persisted review ----------

export const TrustAccountReviewStatus = z.enum([
  "pending",
  "reconciling",
  "checking_compliance",
  "drafting_pack",
  "complete",
  "signed_off",
  "failed",
]);
export type TrustAccountReviewStatus = z.infer<typeof TrustAccountReviewStatus>;

export const TrustAccountReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("trust_accounting").default("trust_accounting"),
  createdAt: z.string(),
  jurisdiction: Jurisdiction.default("VIC"),
  status: TrustAccountReviewStatus,
  input: TrustAccountInputSchema,
  reconciliation: TrustReconciliationSchema.optional(),
  findings: z.array(TrustComplianceFindingSchema).default([]),
  pack: TrustPackSchema.optional(),
  error: z.string().optional(),
});
export type TrustAccountReview = z.infer<typeof TrustAccountReviewSchema>;
