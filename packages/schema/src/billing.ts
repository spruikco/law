import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

/**
 * Billing automation under Legal Profession Uniform Law (LPUL) Pt 4.3.
 * Generates a compliant tax invoice + cover letter for the supervising
 * solicitor to review and sign. Keeps the structured intake (no file upload):
 * line items + disbursements + costs-agreement reference + prior bills.
 *
 * Key sections engaged:
 *   s 172  — costs must be fair and reasonable
 *   s 174  — disclosure was given before engagement
 *   s 182  — uplift fee cap (25% on litigation if conditional)
 *   s 186  — bill must be in writing + signed
 *   s 187  — right to request itemised bill within 30 days; itemised bill due
 *            within 21 days of request
 *   s 192  — notice of client rights must accompany the bill
 *   s 193  — interest may be charged on overdue legal costs only if costs
 *            agreement says so AND bill states it
 *   s 195  — itemised bill content
 *   s 196  — bill must not be given before relevant disclosures + must be
 *            given before suing for recovery
 *
 * Tax invoice form additionally engages GST Act 1999 (Cth) s 29-70 (supplier
 * identity, ABN, "Tax Invoice" label, recipient if total >= $1,000, date,
 * supply description, GST amount).
 */

// ---------- Bill kind ----------

export const BillKindSchema = z.enum([
  "interim_progress",
  "final",
  "itemised_on_request",
  "memorandum_of_costs",
]);
export type BillKind = z.infer<typeof BillKindSchema>;

// ---------- Line items ----------

export const BillLineItemSchema = z.object({
  date: z.string().describe("ISO date the work was done"),
  feeEarner: z.string(),
  description: z.string(),
  units: z.number().describe("Time units. 1 unit = 6 minutes (10 units = 1 hour)."),
  rate: MoneySchema.describe("Per-hour rate"),
  amount: MoneySchema,
  taxable: z.boolean().default(true),
});
export type BillLineItem = z.infer<typeof BillLineItemSchema>;

export const DisbursementSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: MoneySchema,
  gstApplicable: z.boolean().default(true),
  paidFromTrust: z.boolean().default(false).describe("Paid from client's trust money"),
});
export type Disbursement = z.infer<typeof DisbursementSchema>;

// ---------- Prior bill (for reconciliation) ----------

export const PriorBillRefSchema = z.object({
  number: z.string(),
  issuedOn: z.string(),
  total: MoneySchema,
  paid: MoneySchema,
});
export type PriorBillRef = z.infer<typeof PriorBillRefSchema>;

// ---------- Inputs ----------

export const BillingInputSchema = z.object({
  jurisdiction: Jurisdiction.default("VIC"),
  billKind: BillKindSchema,
  billNumber: z.string().describe("Practice's invoice/bill number"),
  practice: z.object({
    name: z.string(),
    abn: z.string().describe("11-digit ABN; required for tax invoice"),
    address: z.string(),
    principalSolicitor: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    bankName: z.string().optional(),
    bsb: z.string().optional(),
    accountNumber: z.string().optional(),
    accountName: z.string().optional(),
  }),
  client: z.object({
    name: z.string(),
    address: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  matterRef: z.string().describe("Practice's internal matter reference"),
  matterDescription: z.string(),
  // Costs agreement / disclosure compliance:
  costsAgreementOnFile: z.boolean().default(true).describe("LPUL s 180 written costs agreement"),
  costsDisclosureGivenAt: z.string().optional().describe("ISO date s 174 disclosure was given"),
  isConditional: z.boolean().default(false),
  upliftPercent: z.number().min(0).max(25).optional(),
  upliftAppliedToFees: z.boolean().default(false).describe("Uplift recognised in this bill"),
  // Period:
  periodStart: z.string().describe("ISO start date covered by this bill"),
  periodEnd: z.string().describe("ISO end date covered by this bill"),
  issuedOn: z.string().describe("ISO bill issue date"),
  dueOn: z.string().describe("ISO due date"),
  // Items:
  feeItems: z.array(BillLineItemSchema).default([]),
  disbursements: z.array(DisbursementSchema).default([]),
  priorBills: z.array(PriorBillRefSchema).default([]),
  // Interest / overdue:
  interestPercent: z.number().min(0).optional().describe("Per-annum interest rate on overdue legal costs"),
  interestClauseInAgreement: z.boolean().default(false).describe("Costs agreement permits interest under s 195"),
  // Trust money:
  trustBalance: MoneySchema.optional().describe("Client's trust money balance available to draw"),
  willWithdrawFromTrust: z.boolean().default(false),
  // Sophisticated client / sign-off:
  isSophisticatedClient: z.boolean().default(false).describe("LPUL s 174(4) — modified disclosure"),
  signingSolicitorName: z.string().describe("Australian legal practitioner who will sign the bill (s 186)"),
  // Free-text:
  matterNotes: z.string().optional(),
  paymentInstructions: z.string().optional(),
});
export type BillingInput = z.infer<typeof BillingInputSchema>;

// ---------- Computed totals ----------

export const BillingTotalsSchema = z.object({
  feesSubtotal: MoneySchema,
  upliftAmount: MoneySchema.optional(),
  disbursementsSubtotal: MoneySchema,
  disbursementsGstable: MoneySchema,
  disbursementsNonGstable: MoneySchema,
  subtotalExGst: MoneySchema,
  gst: MoneySchema,
  totalIncGst: MoneySchema,
  trustOffset: MoneySchema.optional(),
  priorPaid: MoneySchema.optional(),
  amountDue: MoneySchema,
});
export type BillingTotals = z.infer<typeof BillingTotalsSchema>;

// ---------- Compliance check ----------

export const BillingFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional(),
});
export type BillingFinding = z.infer<typeof BillingFindingSchema>;

// ---------- Document sections ----------

export const BillingDocumentSectionId = z.enum([
  "header",
  "tax_invoice",
  "fee_summary",
  "fee_items",
  "disbursements",
  "uplift",
  "totals",
  "trust_application",
  "interest_notice",
  "client_rights_notice",
  "payment_instructions",
  "signature_block",
]);
export type BillingDocumentSectionId = z.infer<typeof BillingDocumentSectionId>;

export const BillingDocumentSectionSchema = z.object({
  id: BillingDocumentSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const BillingDocumentSchema = z.object({
  date: z.string(),
  sections: z.array(BillingDocumentSectionSchema),
});
export type BillingDocument = z.infer<typeof BillingDocumentSchema>;

// ---------- Persisted review ----------

export const BillingReviewStatus = z.enum([
  "pending",
  "computing_totals",
  "checking_compliance",
  "drafting_bill",
  "complete",
  "issued",
  "paid",
  "failed",
]);
export type BillingReviewStatus = z.infer<typeof BillingReviewStatus>;

// Legacy re-export for compatibility:
export const BillSchema = z.object({
  id: z.string(),
  kind: BillKindSchema,
  jurisdiction: Jurisdiction.default("VIC"),
  practiceName: z.string(),
  practiceAbn: z.string(),
  clientName: z.string(),
  matterRef: z.string(),
  matterDescription: z.string(),
  issuedOn: z.string(),
  dueOn: z.string(),
  feeItems: z.array(BillLineItemSchema).default([]),
  disbursements: z.array(DisbursementSchema).default([]),
  subtotal: MoneySchema,
  gst: MoneySchema,
  total: MoneySchema,
  notes: z.string().optional(),
});
export type Bill = z.infer<typeof BillSchema>;

export const BillingReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("billing").default("billing"),
  createdAt: z.string(),
  jurisdiction: Jurisdiction.default("VIC"),
  status: BillingReviewStatus,
  input: BillingInputSchema,
  totals: BillingTotalsSchema.optional(),
  findings: z.array(BillingFindingSchema).default([]),
  document: BillingDocumentSchema.optional(),
  error: z.string().optional(),
});
export type BillingReview = z.infer<typeof BillingReviewSchema>;
