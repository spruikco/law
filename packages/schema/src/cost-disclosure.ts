import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

/**
 * Cost disclosure under Legal Profession Uniform Law (LPUL) Part 4.3 Div 3.
 * Section 174 LPUL (Vic) sets the disclosure obligations a law practice owes
 * a client at engagement. Failures expose the practice to costs being
 * non-recoverable (s 178) and to disciplinary findings.
 *
 * Mandatory s 174 disclosures (paraphrased):
 *   - basis on which legal costs will be calculated
 *   - estimated total + significant changes if it changes
 *   - the client's right to negotiate a costs agreement
 *   - the client's right to receive a bill (and to request itemised bill)
 *   - the client's right to be informed of the progress of the matter
 *   - the client's right to be informed of substantial changes
 *   - the client's right to accept or reject any offer of settlement
 *   - the client's right to seek the assistance of the VLSB+C
 *   - avenues open if a costs dispute arises (s 198 + Pt 5.4 dispute resolution)
 *   - if conditional costs agreement / uplift fee — additional disclosures
 *     under s 181 + s 182
 */

// ---------- Inputs ----------

export const CostDisclosureMatterTypeSchema = z.enum([
  "conveyance",
  "lease_review",
  "litigation",
  "estate",
  "wills_and_estate_planning",
  "commercial_advice",
  "family_law",
  "criminal",
  "advice_only",
  "other",
]);
export type CostDisclosureMatterType = z.infer<typeof CostDisclosureMatterTypeSchema>;

export const CostDisclosureFeeBasisSchema = z.enum([
  "fixed",
  "hourly",
  "milestone",
  "conditional",
  "blended",
]);
export type CostDisclosureFeeBasis = z.infer<typeof CostDisclosureFeeBasisSchema>;

export const HourlyRateRowSchema = z.object({
  role: z.string().describe("e.g. Principal, Senior Associate, Lawyer, Paralegal"),
  rate: MoneySchema,
});
export type HourlyRateRow = z.infer<typeof HourlyRateRowSchema>;

export const CostDisclosureInputSchema = z.object({
  jurisdiction: Jurisdiction.default("VIC"),
  practice: z.object({
    name: z.string(),
    abn: z.string().optional(),
    address: z.string(),
    principalSolicitor: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
  }),
  client: z.object({
    name: z.string(),
    address: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  matterType: CostDisclosureMatterTypeSchema,
  matterDescription: z.string(),
  feeBasis: CostDisclosureFeeBasisSchema,
  estimatedTotal: MoneySchema.optional(),
  estimateRange: z
    .object({ low: MoneySchema, high: MoneySchema })
    .optional(),
  fixedFeeAmount: MoneySchema.optional(),
  hourlyRates: z.array(HourlyRateRowSchema).default([]),
  disbursementsAnticipated: z.array(z.string()).default([]),
  billingFrequency: z.string().describe("e.g. monthly, on milestone, on completion"),
  paymentTerms: z.string().describe("e.g. 14 days, payment on completion"),
  isConditional: z.boolean().default(false),
  upliftPercent: z.number().min(0).max(25).optional().describe("LPUL s 182 cap is 25%"),
  hasContingencyExposure: z.boolean().default(false),
  isSophisticatedClient: z.boolean().default(false).describe("LPUL s 174(4) — disclosure may be modified"),
  matterAssumptions: z.array(z.string()).default([]).describe("Assumptions underlying the estimate"),
  matterRisks: z.array(z.string()).default([]).describe("Major risk factors that may shift costs"),
  noteToClient: z.string().optional(),
});
export type CostDisclosureInput = z.infer<typeof CostDisclosureInputSchema>;

// ---------- Compliance check ----------

export const CostDisclosureFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional(),
});
export type CostDisclosureFinding = z.infer<typeof CostDisclosureFindingSchema>;

// ---------- Letter ----------

export const CostDisclosureLetterSectionId = z.enum([
  "header",
  "matter_description",
  "fee_basis",
  "estimate",
  "hourly_rates",
  "disbursements",
  "billing_and_payment",
  "conditional_costs_uplift",
  "client_rights",
  "dispute_resolution",
  "assumptions_and_risks",
  "acceptance_block",
]);
export type CostDisclosureLetterSectionId = z.infer<typeof CostDisclosureLetterSectionId>;

export const CostDisclosureLetterSectionSchema = z.object({
  id: CostDisclosureLetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const CostDisclosureLetterSchema = z.object({
  date: z.string(),
  sections: z.array(CostDisclosureLetterSectionSchema),
});
export type CostDisclosureLetter = z.infer<typeof CostDisclosureLetterSchema>;

// ---------- Persisted review ----------

export const CostDisclosureReviewStatus = z.enum([
  "pending",
  "checking_compliance",
  "drafting_letter",
  "complete",
  "issued",
  "accepted",
  "superseded",
  "failed",
]);
export type CostDisclosureReviewStatus = z.infer<typeof CostDisclosureReviewStatus>;

export const CostDisclosureSchema = CostDisclosureInputSchema; // legacy alias
export type CostDisclosure = z.infer<typeof CostDisclosureSchema>;

export const CostDisclosureReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("cost_disclosure").default("cost_disclosure"),
  createdAt: z.string(),
  jurisdiction: Jurisdiction.default("VIC"),
  status: CostDisclosureReviewStatus,
  input: CostDisclosureInputSchema,
  findings: z.array(CostDisclosureFindingSchema).default([]),
  letter: CostDisclosureLetterSchema.optional(),
  error: z.string().optional(),
});
export type CostDisclosureReview = z.infer<typeof CostDisclosureReviewSchema>;
