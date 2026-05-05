import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

// ---------- Classification: retail vs non-retail ----------
// Under the Retail Leases Act 2003 (Vic) s4, RLA protections only apply if the
// lease is a "retail premises lease". If not retail, RLA protections do NOT
// apply and the tenant is on common-law + general Property Law Act footing.

export const LeaseKind = z.enum(["retail", "non_retail", "unknown"]);
export type LeaseKind = z.infer<typeof LeaseKind>;

export const LeaseClassificationSchema = z.object({
  kind: LeaseKind,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("Why retail / non-retail was chosen, with reference to s4 RLA 2003"),
  rlaApplies: z.boolean().describe("True if Retail Leases Act 2003 (Vic) protections apply"),
  excludedReason: z.string().optional().describe("If non-retail, which exclusion under s4 applies"),
});
export type LeaseClassification = z.infer<typeof LeaseClassificationSchema>;

// ---------- Lease items / particulars ----------

export const LeasePartySchema = z.object({
  role: z.enum(["landlord", "tenant", "guarantor", "agent", "other"]),
  name: z.string(),
  acn_or_abn: z.string().optional(),
  address: z.string().optional(),
});
export type LeaseParty = z.infer<typeof LeasePartySchema>;

export const RentReviewSchema = z.object({
  method: z.enum([
    "fixed_percent",
    "fixed_amount",
    "cpi",
    "market",
    "greater_of",
    "ratchet",
    "other",
  ]),
  description: z.string().describe("Verbatim description of the review mechanism"),
  frequency: z.string().optional(),
  ratchetPresent: z.boolean().describe("True if review contains a ratchet clause (no decrease even if market drops)"),
});
export type RentReview = z.infer<typeof RentReviewSchema>;

export const LeaseItemsSchema = z.object({
  premisesAddress: z.string(),
  premisesDescription: z.string().optional().describe("e.g. 'Shop 3, Ground Floor'"),
  parties: z.array(LeasePartySchema),
  permittedUse: z.string(),
  commencementDate: z.string().optional(),
  termYears: z.number().optional(),
  termDescription: z.string().describe("Full term description, e.g. '5 years + 5 year option'"),
  optionTerms: z.array(z.string()).default([]).describe("Each option term as described"),
  commencingRent: MoneySchema.optional(),
  rentReview: RentReviewSchema.optional(),
  outgoingsPayable: z.boolean().describe("True if tenant pays outgoings in addition to rent"),
  outgoingsDescription: z.string().optional().describe("What's included — may include non-standard items"),
  bankGuarantee: MoneySchema.optional(),
  personalGuarantee: z.boolean().describe("Whether a personal guarantee (beyond tenant entity) is required"),
  personalGuarantorNames: z.array(z.string()).default([]),
  makeGoodDescription: z.string().optional().describe("Verbatim make-good / reinstatement obligation"),
  liquorLicenceRequired: z.boolean().optional(),
});
export type LeaseItems = z.infer<typeof LeaseItemsSchema>;

// ---------- Additional Provisions (non-standard clauses) ----------
// This is where tenants typically get squeezed. Each provision gets classified
// + a proposed tenant-favouring amendment in "polite but firm" tone.

export const ProvisionClassification = z.enum([
  "standard",
  "tenant_adverse",
  "landlord_favoured",
  "unusual",
  "rla_conflict",
]);
export type ProvisionClassification = z.infer<typeof ProvisionClassification>;

export const ProvisionFocusArea = z.enum([
  "ongoing_financial_obligation",
  "make_good",
  "outgoings",
  "rent_review",
  "guarantee_security",
  "assignment_subletting",
  "default_termination",
  "option_exercise",
  "insurance_indemnity",
  "relocation_demolition",
  "other",
]);
export type ProvisionFocusArea = z.infer<typeof ProvisionFocusArea>;

export const AdditionalProvisionSchema = z.object({
  number: z.string().describe("Clause number, e.g. 'AP1', '23.2'"),
  heading: z.string().optional(),
  fullText: z.string().describe("Verbatim clause text — do NOT paraphrase"),
  summary: z.string(),
  classification: ProvisionClassification,
  focusArea: ProvisionFocusArea,
  severity: Severity,
  tenantImpact: z.string().describe("Plain-English impact on the tenant"),
  proposedAmendment: z
    .string()
    .optional()
    .describe("Polite-but-firm redline suggestion. Omit for 'standard' provisions."),
  amendmentRationale: z
    .string()
    .optional()
    .describe("One-sentence rationale for the amendment the tenant can use in negotiation"),
  rlaConflict: z.boolean().default(false).describe("True if the clause purports to contract out of an RLA 2003 mandatory provision"),
  citations: z.array(CitationSchema).default([]),
});
export type AdditionalProvision = z.infer<typeof AdditionalProvisionSchema>;

// ---------- Focus area deep-dives ----------

export const MakeGoodAssessmentSchema = z.object({
  present: z.boolean(),
  severityRating: z.enum(["light", "moderate", "heavy", "bare_shell"]).optional(),
  quotedText: z.string().optional(),
  concerns: z.array(z.string()).default([]),
  proposedAmendment: z.string().optional(),
  costRiskNote: z.string().optional().describe("Plain-English indication of potential cost exposure"),
});
export type MakeGoodAssessment = z.infer<typeof MakeGoodAssessmentSchema>;

export const OutgoingsItemSchema = z.object({
  item: z.string(),
  standard: z.boolean().describe("True if this is a standard LIV 2023 outgoing item"),
  concern: z.string().optional(),
});

export const OutgoingsAssessmentSchema = z.object({
  payable: z.boolean(),
  items: z.array(OutgoingsItemSchema).default([]),
  capPresent: z.boolean().describe("True if the lease caps annual outgoings or year-on-year increases"),
  excessiveItems: z.array(z.string()).default([]).describe("Items beyond standard outgoings (e.g. landlord's capital costs, land tax on single-holding basis)"),
  proposedAmendment: z.string().optional(),
});
export type OutgoingsAssessment = z.infer<typeof OutgoingsAssessmentSchema>;

export const OngoingFinancialObligationsSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string(),
        durationNote: z.string().describe("During lease / after lease / both"),
        severity: Severity,
        // PRJ-693 capability 6: surface unquantified obligations explicitly.
        // Defaults preserve backward-compat for older Pass 2 outputs.
        quantified: z
          .boolean()
          .default(true)
          .describe("False if the cost is open-ended or determined by the landlord at its discretion"),
        triggerCondition: z
          .string()
          .optional()
          .describe("What triggers the obligation, e.g. 'on receipt of an ESM defect notice'"),
        costCeilingAud: z
          .number()
          .nullable()
          .default(null)
          .describe("Cap on tenant exposure in AUD; null if uncapped"),
      }),
    )
    .default([]),
});
export type OngoingFinancialObligations = z.infer<typeof OngoingFinancialObligationsSchema>;

// ---------- PRJ-693 capability 2: make-good cost banding ----------

export const MakeGoodCostBandSchema = z.object({
  band: z.enum(["light", "moderate", "heavy", "bare_shell", "unknown"]),
  estimateLowAud: z.number().optional(),
  estimateHighAud: z.number().optional(),
  basis: z.string().describe("How the band was derived (severity rating + premises type)"),
  qsReferralRecommended: z.boolean(),
});
export type MakeGoodCostBand = z.infer<typeof MakeGoodCostBandSchema>;

// ---------- PRJ-693 capability 3: planning compliance ----------

export const PlanningComplianceSchema = z.object({
  zone: z.string().describe("e.g. 'Commercial 1 Zone (C1Z)'"),
  overlays: z.array(z.string()).default([]),
  permittedUseAllowed: z.enum([
    "as_of_right",
    "permit_required",
    "prohibited",
    "unknown",
  ]),
  permitTriggers: z.array(z.string()).default([]).describe("e.g. liquor licence, signage, extended trading hours"),
  reportUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  concerns: z.array(z.string()).default([]),
});
export type PlanningCompliance = z.infer<typeof PlanningComplianceSchema>;

// ---------- PRJ-693 capability 4: market rent review projections ----------

export const MarketReviewProjectionSchema = z.object({
  optionTermLabel: z.string(),
  projectedDate: z.string().optional(),
  baselineRent: MoneySchema,
  projectedRangeLow: MoneySchema,
  projectedRangeHigh: MoneySchema,
  basis: z.enum([
    "cpi_extrapolation",
    "fixed_uplift_compounded",
    "market_band",
    "insufficient_data",
  ]),
  notes: z.string(),
});
export type MarketReviewProjection = z.infer<typeof MarketReviewProjectionSchema>;

// ---------- PRJ-693 capability 5: landlord non-compliance → unenforceability ⭐ ----------
// The differentiator. One finding per RLA-2003 trigger that voids a lease term
// or removes the tenant's liability to pay until the landlord remedies.

export const UnenforceabilityEffect = z.enum([
  "void",
  "not_liable_until_remedied",
  "right_to_recover",
  "right_to_terminate",
  "right_to_withhold",
]);
export type UnenforceabilityEffect = z.infer<typeof UnenforceabilityEffect>;

export const UnenforceabilityFindingSchema = z.object({
  ruleId: z.string().describe("e.g. 'RLA-s46-no-outgoings-estimate'"),
  trigger: z.object({
    act: z.string().describe("e.g. 'Retail Leases Act 2003 (Vic)'"),
    section: z.string().describe("e.g. '46(4)'"),
  }),
  landlordFailure: z.string(),
  detectionSignals: z.array(z.string()).default([]),
  affectedClauses: z.array(z.string()).default([]).describe("Lease clause numbers rendered void / unenforceable"),
  effect: UnenforceabilityEffect,
  estimatedExposureAud: z.number().nullable(),
  evidence: z.array(z.string()).default([]).describe("Verbatim quotes from the lease"),
  remedyForTenant: z.string(),
  citations: z.array(CitationSchema).default([]),
  severity: Severity,
  confidence: z.number().min(0).max(1),
  needsLawyerConfirm: z.boolean().default(false),
});
export type UnenforceabilityFinding = z.infer<typeof UnenforceabilityFindingSchema>;

// ---------- PRJ-693 capability 7: landlord notification obligations ----------

export const LandlordNotificationObligationSchema = z.object({
  source: z.enum(["statutory", "contractual"]),
  description: z.string(),
  citation: CitationSchema.optional(),
  timing: z.string().describe("e.g. '≥3 months before option expiry'"),
  earliestDate: z.string().optional(),
  latestDate: z.string().optional(),
  consequenceOfFailure: z.string(),
  status: z.enum(["upcoming", "overdue", "complete", "unknown"]).default("unknown"),
});
export type LandlordNotificationObligation = z.infer<typeof LandlordNotificationObligationSchema>;

// ---------- PRJ-693 capability 8: option exercise risk + timeline ----------

export const OptionExerciseAnalysisSchema = z.object({
  optionLabel: z.string(),
  exerciseWindowOpens: z.string().optional(),
  exerciseWindowCloses: z.string().optional(),
  exerciseMethod: z.string().describe("Verbatim from the option clause"),
  conditionsToExercise: z.array(z.string()).default([]),
  tenantRisks: z.array(z.string()).default([]),
  landlordRisks: z.array(z.string()).default([]),
  s28EarlyReviewAvailable: z.boolean().default(false),
  s28BCoolingOffAvailable: z.boolean().default(false),
});
export type OptionExerciseAnalysis = z.infer<typeof OptionExerciseAnalysisSchema>;

// ---------- PRJ-693 capability 9: LIV version detection + delta ----------

export const LivVersion = z.enum(["2009", "2013", "2017", "2023", "unknown"]);
export type LivVersion = z.infer<typeof LivVersion>;

export const LivVersionAnalysisSchema = z.object({
  isLiv: z.boolean(),
  detectedVersion: LivVersion.optional(),
  confidence: z.number().min(0).max(1),
  comparisonAgainst: z.literal("2023").default("2023"),
  deltas: z
    .array(
      z.object({
        clauseRef: z.string(),
        delta: z.enum(["added", "removed", "modified"]),
        summary: z.string(),
        tenantImpact: z.enum(["favourable", "adverse", "neutral"]),
        landlordImpact: z.enum(["favourable", "adverse", "neutral"]),
      }),
    )
    .default([]),
});
export type LivVersionAnalysis = z.infer<typeof LivVersionAnalysisSchema>;

// ---------- PRJ-693 capability 10: commentary cross-reference (Sam Hopper et al.) ----------

export const CommentaryRiskFindingSchema = z.object({
  source: z.enum(["sam_hopper", "other"]),
  articleTitle: z.string(),
  articleUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  riskSummary: z.string(),
  matchReason: z.string().describe("Why this article matches the lease under review"),
  biggestRiskTenant: z.string(),
  biggestRiskLandlord: z.string(),
  citations: z.array(CitationSchema).default([]),
});
export type CommentaryRiskFinding = z.infer<typeof CommentaryRiskFindingSchema>;

// ---------- PRJ-693 capability 11: transfer-of-lease chain analysis ----------

export const LeaseChainDocumentKind = z.enum([
  "head_lease",
  "variation",
  "renewal",
  "deed_of_assignment",
  "deed_of_consent",
  "assignor_disclosure",
  "other",
]);
export type LeaseChainDocumentKind = z.infer<typeof LeaseChainDocumentKind>;

export const LeaseChainAnalysisSchema = z.object({
  chainComplete: z.boolean(),
  documents: z
    .array(
      z.object({
        order: z.number().int(),
        kind: LeaseChainDocumentKind,
        date: z.string().optional(),
        parties: z.array(z.string()).default([]),
        sourceFilename: z.string(),
        summary: z.string(),
      }),
    )
    .default([]),
  missingDocuments: z.array(z.string()).default([]),
  inconsistencies: z
    .array(
      z.object({
        description: z.string(),
        documentRefs: z.array(z.string()).default([]),
        severity: Severity,
      }),
    )
    .default([]),
});
export type LeaseChainAnalysis = z.infer<typeof LeaseChainAnalysisSchema>;

// ---------- Pass 2 bundle ----------

export const LeaseExtractionBundleSchema = z.object({
  classification: LeaseClassificationSchema,
  items: LeaseItemsSchema,
  additionalProvisions: z.array(AdditionalProvisionSchema).default([]),
  makeGood: MakeGoodAssessmentSchema,
  makeGoodCostBand: MakeGoodCostBandSchema.optional(),
  outgoings: OutgoingsAssessmentSchema,
  ongoingObligations: OngoingFinancialObligationsSchema,
  livVersion: LivVersionAnalysisSchema.optional(),
});
export type LeaseExtractionBundle = z.infer<typeof LeaseExtractionBundleSchema>;

// ---------- Pass 3: RLA compliance (retail only) ----------
// Reuses the ComplianceFinding shape already exported from ./review.

// ---------- Pass 5: letter ----------

export const LeaseLetterSectionId = z.enum([
  "summary",
  "classification",
  "items",
  "ongoing_financial_obligations",
  "make_good",
  "outgoings",
  "additional_provisions",
  "rla_compliance",
  // PRJ-693 capability sections (added v1)
  "unenforceability",
  "planning_compliance",
  "market_review_projections",
  "option_analysis",
  "notification_obligations",
  "liv_version",
  "commentary_risks",
  "lease_chain",
  "proposed_amendments_schedule",
  "next_steps",
]);
export type LeaseLetterSectionId = z.infer<typeof LeaseLetterSectionId>;

export const LeaseLetterSectionSchema = z.object({
  id: LeaseLetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});
export type LeaseLetterSection = z.infer<typeof LeaseLetterSectionSchema>;

export const LeaseLetterSchema = z.object({
  clientName: z.string(),
  clientRole: z.enum(["tenant", "landlord"]).default("tenant"),
  premisesAddress: z.string(),
  date: z.string(),
  sections: z.array(LeaseLetterSectionSchema),
});
export type LeaseLetter = z.infer<typeof LeaseLetterSchema>;

// ---------- Persisted review record ----------

export const LeaseReviewStatus = z.enum([
  "pending",
  "classifying",
  "extracting",
  "checking_compliance",
  "analysing_clauses",
  "synthesising_capabilities",
  "composing_letter",
  "complete",
  "failed",
]);
export type LeaseReviewStatus = z.infer<typeof LeaseReviewStatus>;

export const LeaseReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("lease").default("lease"),
  createdAt: z.string(),
  status: LeaseReviewStatus,
  jurisdiction: Jurisdiction.default("VIC"),
  extraction: LeaseExtractionBundleSchema.optional(),
  rlaCompliance: z
    .array(
      // re-use ComplianceFinding via loose shape — retail only
      z.object({
        ruleId: z.string(),
        status: z.enum(["pass", "fail", "warning", "needs_review"]),
        severity: Severity,
        title: z.string(),
        explanation: z.string(),
        citations: z.array(CitationSchema).default([]),
        sourceRefs: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  // PRJ-693 capabilities 5, 7, 8, 10, 11
  unenforceability: z.array(UnenforceabilityFindingSchema).default([]),
  notificationObligations: z.array(LandlordNotificationObligationSchema).default([]),
  optionAnalysis: z.array(OptionExerciseAnalysisSchema).default([]),
  marketReviewProjections: z.array(MarketReviewProjectionSchema).default([]),
  planning: PlanningComplianceSchema.optional(),
  commentaryRisks: z.array(CommentaryRiskFindingSchema).default([]),
  leaseChain: LeaseChainAnalysisSchema.optional(),
  letter: LeaseLetterSchema.optional(),
  error: z.string().optional(),
});
export type LeaseReview = z.infer<typeof LeaseReviewSchema>;
