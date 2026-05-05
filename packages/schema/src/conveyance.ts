import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

/**
 * Conveyance automation — Victorian end-to-end conveyancing.
 *
 * v1 scope: settlement statement preparation. Computes pro-rata adjustments
 * for council rates, water service charges, owners corporation fees and land
 * tax to/from settlement date, calculates stamp duty under the Duties Act
 * 2000 (Vic) (with concessions: principal place of residence, first home
 * buyer, off-the-plan), and drafts the settlement statement + post-settlement
 * notification checklist.
 *
 * Engages:
 *   Sale of Land Act 1962 (Vic) — Section 32 prerequisites
 *   Property Law Act 1958 (Vic) — adjustment conventions
 *   Duties Act 2000 (Vic) — stamp duty + concessions
 *   Land Tax Act 2005 (Vic) — apportionment of land tax (s 96)
 *   Transfer of Land Act 1958 (Vic) — registration
 */

// ---------- Stages (kept for completeness) ----------

export const ConveyanceStageSchema = z.enum([
  "instruction",
  "section_32_drafting",
  "exchange",
  "post_exchange_due_diligence",
  "pre_settlement",
  "settlement",
  "post_settlement",
]);
export type ConveyanceStage = z.infer<typeof ConveyanceStageSchema>;

// ---------- Adjustment inputs ----------

export const RatesAdjustmentInputSchema = z.object({
  authority: z.string().describe("e.g. 'City of Melbourne', 'Yarra Valley Water'"),
  annualAmount: MoneySchema,
  periodStart: z.string().describe("Start of the rating period (financial year usually 1 July)"),
  periodEnd: z.string().describe("End of the rating period (30 June)"),
  amountPaidByVendor: MoneySchema.default({ amount: 0, currency: "AUD" }),
  notes: z.string().optional(),
});
export type RatesAdjustmentInput = z.infer<typeof RatesAdjustmentInputSchema>;

export const OwnersCorpFeesInputSchema = z.object({
  ownersCorpName: z.string(),
  annualAmount: MoneySchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  amountPaidByVendor: MoneySchema.default({ amount: 0, currency: "AUD" }),
  specialLevyOutstanding: MoneySchema.optional(),
  notes: z.string().optional(),
});
export type OwnersCorpFeesInput = z.infer<typeof OwnersCorpFeesInputSchema>;

export const LandTaxInputSchema = z.object({
  vendorAssessedAmount: MoneySchema.describe("Vendor's land tax assessment for the calendar year"),
  yearStart: z.string().describe("1 January"),
  yearEnd: z.string().describe("31 December"),
  isVendorAbsentee: z.boolean().default(false),
  notes: z.string().optional(),
});
export type LandTaxInput = z.infer<typeof LandTaxInputSchema>;

// ---------- Stamp duty inputs ----------

export const StampDutyInputSchema = z.object({
  isPpr: z.boolean().default(false).describe("Principal place of residence"),
  isFirstHomeBuyer: z.boolean().default(false),
  isOffThePlan: z.boolean().default(false),
  offThePlanContractDate: z.string().optional(),
  isForeignPurchaser: z.boolean().default(false).describe("Foreign purchaser additional duty 8%"),
  pensionerConcession: z.boolean().default(false),
  notes: z.string().optional(),
});
export type StampDutyInput = z.infer<typeof StampDutyInputSchema>;

// ---------- Settlement input ----------

export const SettlementInputSchema = z.object({
  jurisdiction: Jurisdiction.default("VIC"),
  side: z.enum(["vendor", "purchaser"]).describe("Whose lawyer is preparing this"),
  practice: z.object({
    name: z.string(),
    abn: z.string().optional(),
    address: z.string(),
    principalSolicitor: z.string(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
  }),
  client: z.object({
    name: z.string(),
    address: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  property: z.object({
    addressLine: z.string(),
    suburb: z.string(),
    postcode: z.string(),
    titleVolume: z.string().optional(),
    titleFolio: z.string().optional(),
    plan: z.string().optional(),
    isOwnersCorpLot: z.boolean().default(false),
  }),
  vendor: z.object({
    name: z.string(),
    address: z.string().optional(),
  }),
  purchaser: z.object({
    name: z.string(),
    address: z.string().optional(),
  }),
  contractPrice: MoneySchema,
  depositPaid: MoneySchema,
  contractDate: z.string(),
  settlementDate: z.string(),
  adjustmentDate: z
    .string()
    .describe("Usually = settlementDate; adjustments split on this date"),
  // Adjustments:
  councilRates: RatesAdjustmentInputSchema.optional(),
  waterRates: RatesAdjustmentInputSchema.optional(),
  waterUsage: MoneySchema.optional().describe("Final usage charge to settlement"),
  ownersCorpFees: OwnersCorpFeesInputSchema.optional(),
  landTax: LandTaxInputSchema.optional(),
  // Other line items:
  releaseOfMortgageFee: MoneySchema.optional(),
  registrationFee: MoneySchema.optional(),
  pexaSettlementFee: MoneySchema.optional(),
  otherDebits: z
    .array(z.object({ description: z.string(), amount: MoneySchema }))
    .default([])
    .describe("Other amounts owed by purchaser at settlement"),
  otherCredits: z
    .array(z.object({ description: z.string(), amount: MoneySchema }))
    .default([])
    .describe("Other amounts owed back to purchaser"),
  // Stamp duty:
  stampDuty: StampDutyInputSchema.default({}),
  // GST:
  isGoingConcernGstFree: z.boolean().default(false),
  // Delivery:
  pexaWorkspaceId: z.string().optional(),
  finalNotes: z.string().optional(),
});
export type SettlementInput = z.infer<typeof SettlementInputSchema>;

// ---------- Computed adjustment lines ----------

export const AdjustmentLineSchema = z.object({
  description: z.string(),
  basis: z.enum([
    "council_rates",
    "water_rates",
    "water_usage",
    "owners_corp_fees",
    "owners_corp_special_levy",
    "land_tax",
    "deposit",
    "stamp_duty",
    "registration_fee",
    "release_of_mortgage_fee",
    "pexa_fee",
    "other",
  ]),
  side: z.enum(["debit", "credit"]).describe("From the purchaser's perspective"),
  amount: MoneySchema,
  daysVendor: z.number().optional(),
  daysPurchaser: z.number().optional(),
  totalDays: z.number().optional(),
  citations: z.array(CitationSchema).default([]),
  note: z.string().optional(),
});
export type AdjustmentLine = z.infer<typeof AdjustmentLineSchema>;

export const StampDutyCalculationSchema = z.object({
  dutiableValue: MoneySchema,
  baseDuty: MoneySchema,
  pprConcession: MoneySchema.optional(),
  fhbConcession: MoneySchema.optional(),
  offThePlanConcession: MoneySchema.optional(),
  pensionerConcession: MoneySchema.optional(),
  foreignPurchaserAdditional: MoneySchema.optional(),
  totalDutyPayable: MoneySchema,
  workingNotes: z.array(z.string()).default([]),
});
export type StampDutyCalculation = z.infer<typeof StampDutyCalculationSchema>;

export const SettlementCalculationSchema = z.object({
  contractPrice: MoneySchema,
  depositPaid: MoneySchema,
  balanceOfPurchasePrice: MoneySchema,
  adjustments: z.array(AdjustmentLineSchema),
  netDebits: MoneySchema.describe("Sum of debits to purchaser at settlement (excl price)"),
  netCredits: MoneySchema.describe("Sum of credits to purchaser at settlement"),
  totalAtSettlement: MoneySchema.describe("Balance of price + net debits - net credits"),
  stampDuty: StampDutyCalculationSchema,
});
export type SettlementCalculation = z.infer<typeof SettlementCalculationSchema>;

// ---------- Compliance findings ----------

export const ConveyanceFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional(),
});
export type ConveyanceFinding = z.infer<typeof ConveyanceFindingSchema>;

// ---------- Document sections ----------

export const SettlementDocSectionId = z.enum([
  "header",
  "matter_summary",
  "purchase_price",
  "adjustments",
  "stamp_duty",
  "totals",
  "payment_directions",
  "post_settlement_checklist",
  "signoff",
]);
export type SettlementDocSectionId = z.infer<typeof SettlementDocSectionId>;

export const SettlementDocSectionSchema = z.object({
  id: SettlementDocSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const SettlementDocumentSchema = z.object({
  date: z.string(),
  sections: z.array(SettlementDocSectionSchema),
});
export type SettlementDocument = z.infer<typeof SettlementDocumentSchema>;

// ---------- Persisted review ----------

export const ConveyanceReviewStatus = z.enum([
  "pending",
  "computing_adjustments",
  "checking_compliance",
  "drafting_statement",
  "complete",
  "settled",
  "failed",
]);
export type ConveyanceReviewStatus = z.infer<typeof ConveyanceReviewStatus>;

// Legacy types preserved:
export const SettlementAdjustmentSchema = z.object({
  description: z.string(),
  basis: z.enum([
    "council_rates",
    "water_rates",
    "owners_corp_fees",
    "land_tax",
    "other",
  ]),
  vendorAmount: MoneySchema.optional(),
  purchaserAmount: MoneySchema.optional(),
  netToVendor: MoneySchema.optional(),
});
export type SettlementAdjustment = z.infer<typeof SettlementAdjustmentSchema>;

export const ConveyanceMatterSchema = z.object({
  id: z.string(),
  kind: z.literal("conveyance").default("conveyance"),
  jurisdiction: Jurisdiction.default("VIC"),
  side: z.enum(["vendor", "purchaser"]),
  stage: ConveyanceStageSchema,
  propertyAddress: z.string(),
  settlementDate: z.string().optional(),
  contractPrice: MoneySchema.optional(),
  depositPaid: MoneySchema.optional(),
  adjustments: z.array(SettlementAdjustmentSchema).default([]),
  pexaWorkspaceId: z.string().optional(),
  dutyAmount: MoneySchema.optional(),
  notes: z.string().optional(),
});
export type ConveyanceMatter = z.infer<typeof ConveyanceMatterSchema>;

export const ConveyanceReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("conveyance_settlement").default("conveyance_settlement"),
  createdAt: z.string(),
  jurisdiction: Jurisdiction.default("VIC"),
  status: ConveyanceReviewStatus,
  input: SettlementInputSchema,
  calculation: SettlementCalculationSchema.optional(),
  findings: z.array(ConveyanceFindingSchema).default([]),
  document: SettlementDocumentSchema.optional(),
  error: z.string().optional(),
});
export type ConveyanceReview = z.infer<typeof ConveyanceReviewSchema>;
