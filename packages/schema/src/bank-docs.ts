import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, MoneySchema, Severity } from "./review";

/**
 * Bank documents review module.
 *
 * Scope: residential / commercial mortgages, loan agreements, letters of offer,
 * personal & corporate guarantees, general security agreements, and deeds of
 * priority. Built around three regimes:
 *
 *   - **National Credit Code** (Sch 1, NCCP Act 2009) for consumer credit
 *     contracts (ss 12–17 disclosure; s 76 unjust transactions; ss 23–25,
 *     76–84 enforceability)
 *   - **Australian Consumer Law** (Sch 2, CCA 2010), in particular ss 18
 *     (misleading), 20–22 (unconscionable conduct), 23–28 (unfair contract
 *     terms in consumer / small-business contracts)
 *   - **Personal Property Securities Act 2009 (Cth)** for the GSA / charge
 *     analysis (priority, attachment, perfection, vesting on insolvency)
 *
 * State overlay (VIC v1): Property Law Act 1958 (Vic) Pt I; TLA 1958 ss 74–80
 * for registered mortgages; Wallace v Mooney guarantee rules at common law.
 */

// ---------- Classification ----------

export const BankDocumentKind = z.enum([
  "mortgage",
  "loan_agreement",
  "letter_of_offer",
  "guarantee",
  "general_security_agreement",
  "deed_of_priority",
  "deed_of_subordination",
  "specific_security_agreement",
  "indemnity",
  "other",
]);
export type BankDocumentKind = z.infer<typeof BankDocumentKind>;

export const FacilityKind = z.enum([
  "term_loan",
  "interest_only",
  "revolving",
  "overdraft",
  "construction",
  "bill_facility",
  "asset_finance",
  "guarantee_facility",
  "unknown",
]);
export type FacilityKind = z.infer<typeof FacilityKind>;

export const BankDocClassificationSchema = z.object({
  kind: BankDocumentKind,
  facilityKind: FacilityKind.optional(),
  isConsumerCredit: z
    .boolean()
    .describe("True if National Credit Code applies (NCCP Act Sch 1 s 5)"),
  nccBasis: z
    .string()
    .optional()
    .describe(
      "Why the NCC does or does not apply — refer to s 5 (predominant purpose) and the s 6 exclusions",
    ),
  isUnfairContractTermsRegime: z
    .boolean()
    .describe(
      "True if ACL Pt 2-3 unfair contract terms apply (consumer or small-business standard-form contract)",
    ),
  isThirdPartyGuarantee: z
    .boolean()
    .describe(
      "True if a third party (i.e. someone other than the borrower) is giving a guarantee or indemnity. Triggers Code of Banking Practice cl 31 + Yerkey v Jones / Garcia heightened obligations.",
    ),
  jointAndSeveral: z.boolean().describe("True if multiple borrowers / guarantors are jointly and severally liable"),
  confidence: z.number().min(0).max(1),
  reasoning: z
    .string()
    .describe("2-3 sentences explaining the classification with reference to NCC s 5 / s 6 and any ACL UCT triggers"),
});
export type BankDocClassification = z.infer<typeof BankDocClassificationSchema>;

// ---------- Parties ----------

export const BankDocPartySchema = z.object({
  role: z.enum([
    "borrower",
    "lender",
    "guarantor",
    "mortgagor",
    "mortgagee",
    "grantor",
    "secured_party",
    "broker",
    "trustee",
    "beneficiary",
    "other",
  ]),
  name: z.string(),
  acn_or_abn: z.string().optional(),
  address: z.string().optional(),
  capacityNote: z
    .string()
    .optional()
    .describe(
      "e.g. 'in own right', 'as trustee for the Smith Family Trust ABN 123', 'in capacity as director only'",
    ),
});
export type BankDocParty = z.infer<typeof BankDocPartySchema>;

// ---------- Facility / loan particulars ----------

export const InterestRateSchema = z.object({
  type: z.enum(["fixed", "variable", "split", "introductory", "stepped", "other"]),
  initialRatePct: z.number().optional(),
  comparisonRatePct: z.number().optional(),
  description: z.string().describe("Verbatim rate description from the docs"),
  fixedPeriodMonths: z.number().int().optional(),
  defaultRatePct: z
    .number()
    .optional()
    .describe("Higher-rate-on-default. Capture the rate or the spread above the standard rate."),
  resetMechanism: z
    .string()
    .optional()
    .describe("How variable rate resets — by reference to BBSY, RBA cash rate, lender's standard rate, etc."),
});
export type InterestRate = z.infer<typeof InterestRateSchema>;

export const RepaymentScheduleSchema = z.object({
  description: z.string().describe("Verbatim repayment description"),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annually", "bullet", "other"]).optional(),
  installmentAmount: MoneySchema.optional(),
  termMonths: z.number().int().optional(),
  interestOnlyMonths: z
    .number()
    .int()
    .optional()
    .describe("Length of any interest-only period before P&I switches in"),
  balloonAtMaturity: MoneySchema.optional(),
});
export type RepaymentSchedule = z.infer<typeof RepaymentScheduleSchema>;

export const SecurityItemSchema = z.object({
  kind: z.enum([
    "real_property",
    "specific_personal_property",
    "all_present_and_after_acquired_property",
    "circulating_assets",
    "shares",
    "deposit",
    "directors_guarantee",
    "spouse_guarantee",
    "third_party_guarantee",
    "other",
  ]),
  description: z.string(),
  /**
   * For real-property security: title reference, address.
   * For PPSA security: collateral class (AAPP, motor vehicles, etc.).
   * For guarantees: name of guarantor and any cap.
   */
  detail: z.string().optional(),
  capAmount: MoneySchema.optional().describe("Liability cap on this security, if any"),
  crossCollateralised: z
    .boolean()
    .default(false)
    .describe("True if this security secures other facilities of the lender"),
});
export type SecurityItem = z.infer<typeof SecurityItemSchema>;

export const FeeItemSchema = z.object({
  description: z.string(),
  amount: MoneySchema.optional(),
  formula: z
    .string()
    .optional()
    .describe("If the fee is a formula rather than a fixed amount"),
  trigger: z.enum([
    "establishment",
    "drawdown",
    "ongoing",
    "early_repayment",
    "default",
    "discharge",
    "valuation",
    "other",
  ]),
  payableBy: z.enum(["borrower", "guarantor", "either"]).default("borrower"),
});
export type FeeItem = z.infer<typeof FeeItemSchema>;

export const FacilityParticularsSchema = z.object({
  parties: z.array(BankDocPartySchema),
  borrowerName: z.string().optional(),
  lenderName: z.string().optional(),
  facilityAmount: MoneySchema.optional(),
  facilityKind: FacilityKind.optional(),
  drawdownConditions: z.array(z.string()).default([]),
  purpose: z.string().optional(),
  interestRate: InterestRateSchema.optional(),
  repayment: RepaymentScheduleSchema.optional(),
  securities: z.array(SecurityItemSchema).default([]),
  fees: z.array(FeeItemSchema).default([]),
  reviewEvents: z
    .array(z.string())
    .default([])
    .describe("Annual review, financial-covenant testing, etc."),
  earlyRepaymentDescription: z.string().optional(),
  defaultDescription: z.string().optional(),
  governingLaw: z.string().optional(),
});
export type FacilityParticulars = z.infer<typeof FacilityParticularsSchema>;

// ---------- Borrower-adverse provisions ----------

export const BankDocProvisionClassification = z.enum([
  "standard",
  "borrower_adverse",
  "guarantor_adverse",
  "lender_favoured",
  "unusual",
  "ncc_conflict",
  "acl_uct_candidate",
]);
export type BankDocProvisionClassification = z.infer<typeof BankDocProvisionClassification>;

export const BankDocProvisionFocusArea = z.enum([
  "all_monies_clause",
  "cross_default",
  "cross_collateralisation",
  "set_off_combination",
  "default_acceleration",
  "default_interest",
  "indemnity_scope",
  "guarantee_scope",
  "guarantor_release",
  "joint_and_several",
  "principal_debtor_clause",
  "lender_discretion",
  "variation_unilateral",
  "review_event_trigger",
  "financial_covenants",
  "early_repayment_penalty",
  "valuation_costs",
  "ipso_facto",
  "no_set_off",
  "deemed_service",
  "unfair_contract_term",
  "consumer_credit_disclosure",
  "other",
]);
export type BankDocProvisionFocusArea = z.infer<typeof BankDocProvisionFocusArea>;

export const BankDocProvisionSchema = z.object({
  number: z.string().describe("Clause number, e.g. '4.2', 'Sch 2 cl 1'"),
  heading: z.string().optional(),
  fullText: z.string().describe("Verbatim clause text — do NOT paraphrase"),
  summary: z.string(),
  classification: BankDocProvisionClassification,
  focusArea: BankDocProvisionFocusArea,
  severity: Severity,
  borrowerImpact: z.string().describe("Plain-English impact on the borrower / guarantor"),
  proposedAmendment: z
    .string()
    .optional()
    .describe(
      "Polite-but-firm redline. Banks rarely amend boilerplate but routinely adjust where ACL UCT or NCC unfair-conduct points are clearly raised. Omit for 'standard'.",
    ),
  amendmentRationale: z.string().optional(),
  uctCandidate: z
    .boolean()
    .default(false)
    .describe("True if the clause is a strong candidate for ACL Pt 2-3 unfair-term challenge"),
  citations: z.array(CitationSchema).default([]),
});
export type BankDocProvision = z.infer<typeof BankDocProvisionSchema>;

// ---------- Guarantee assessment ----------

export const GuaranteeAssessmentSchema = z.object({
  present: z.boolean(),
  guarantors: z.array(z.string()).default([]),
  isThirdPartyConsumerGuarantor: z
    .boolean()
    .describe("True if a non-borrower individual gives a guarantee for a related-party loan"),
  capped: z.boolean(),
  capAmount: MoneySchema.optional(),
  principalDebtorClause: z
    .boolean()
    .describe("True if the guarantor's obligations are expressed as a primary debt — defeats Yerkey/Garcia equity"),
  independentLegalAdviceRequired: z
    .boolean()
    .describe("True if the document requires the guarantor to obtain independent legal advice"),
  ilaCertificateAttached: z.boolean().default(false),
  codeOfBankingPracticeIssues: z
    .array(z.string())
    .default([])
    .describe("Cl 31 / Banking Code 2025 points: warnings, prominence, financial info, marriage/relationship guarantees"),
  garciaRiskFlags: z
    .array(z.string())
    .default([])
    .describe(
      "Volunteer guarantor + spousal/relationship + lender constructive notice = Garcia risk. List each fact pattern detected.",
    ),
  proposedAmendment: z.string().optional(),
});
export type GuaranteeAssessment = z.infer<typeof GuaranteeAssessmentSchema>;

// ---------- Default & enforcement ----------

export const DefaultEventSchema = z.object({
  description: z.string(),
  graceDays: z
    .number()
    .int()
    .nullable()
    .default(null)
    .describe("Grace period in days; null if none stated"),
  noticeRequired: z.boolean(),
  curePeriodDays: z.number().int().nullable().default(null),
  triggersAcceleration: z.boolean(),
  isCrossDefault: z.boolean().default(false),
});
export type DefaultEvent = z.infer<typeof DefaultEventSchema>;

export const DefaultAndEnforcementSchema = z.object({
  defaultEvents: z.array(DefaultEventSchema).default([]),
  noticeMechanism: z
    .string()
    .optional()
    .describe(
      "How notice is served (post / email / deemed service). For NCC consumer credit, the s 88 default notice regime applies regardless.",
    ),
  s88NoticeRecognised: z
    .boolean()
    .default(false)
    .describe("Whether the documents acknowledge the s 88 NCC default-notice obligation"),
  selfHelpClauses: z
    .array(z.string())
    .default([])
    .describe(
      "E.g. ipso facto right to enter, change locks, take possession; clauses excluding judicial supervision",
    ),
  receiverIndemnity: z
    .boolean()
    .default(false)
    .describe("True if borrower indemnifies lender for receivership costs"),
});
export type DefaultAndEnforcement = z.infer<typeof DefaultAndEnforcementSchema>;

// ---------- Disclosure / NCC compliance assessment ----------

export const NccDisclosureChecklistSchema = z.object({
  preContractDisclosureProvided: z.boolean().describe("Per NCC s 16"),
  cashPriceDisclosed: z.boolean().describe("Per NCC s 17(3)"),
  amountFinancedDisclosed: z.boolean(),
  annualPercentageRateDisclosed: z.boolean().describe("Per NCC s 17(4)(c)"),
  comparisonRateDisclosed: z.boolean().describe("Per NCCP regs (where required for advertised credit)"),
  feesAndChargesItemised: z.boolean(),
  defaultRateDisclosed: z.boolean(),
  hardshipNoticeIncluded: z.boolean().describe("Per NCC ss 72–73"),
  cancellationRightsDisclosed: z.boolean(),
  warningsAndCoolingOffDisclosed: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type NccDisclosureChecklist = z.infer<typeof NccDisclosureChecklistSchema>;

// ---------- PPSA assessment (for GSAs / charges) ----------

export const PpsaAssessmentSchema = z.object({
  applies: z.boolean(),
  collateralClasses: z
    .array(
      z.enum([
        "all_present_and_after_acquired_property",
        "all_present_and_after_acquired_property_excepting",
        "specific_personal_property",
        "circulating_assets",
        "non_circulating_assets",
        "motor_vehicles",
        "shares_and_securities",
        "intellectual_property",
        "other",
      ]),
    )
    .default([]),
  attachmentRequirements: z.array(z.string()).default([]),
  perfectionRequirements: z.array(z.string()).default([]),
  taking_free_riskNotes: z
    .array(z.string())
    .default([])
    .describe("Possible taking-free risks under PPSA Pt 2.5 / s 43+"),
  vestingRiskOnInsolvency: z
    .boolean()
    .describe("True if there is a risk of unperfected security vesting in administrator under PPSA s 267"),
  registrationDescription: z
    .string()
    .optional()
    .describe("Whether registration is contemplated and on what timeframe"),
});
export type PpsaAssessment = z.infer<typeof PpsaAssessmentSchema>;

// ---------- Pass 2 bundle ----------

export const BankDocsExtractionBundleSchema = z.object({
  classification: BankDocClassificationSchema,
  particulars: FacilityParticularsSchema,
  provisions: z.array(BankDocProvisionSchema).default([]),
  guarantee: GuaranteeAssessmentSchema,
  defaultAndEnforcement: DefaultAndEnforcementSchema,
  nccChecklist: NccDisclosureChecklistSchema.optional(),
  ppsa: PpsaAssessmentSchema.optional(),
});
export type BankDocsExtractionBundle = z.infer<typeof BankDocsExtractionBundleSchema>;

// ---------- Compliance findings (NCC / ACL / Code of Banking Practice) ----------

export const BankDocComplianceFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  sourceRefs: z.array(z.string()).default([]),
});
export type BankDocComplianceFinding = z.infer<typeof BankDocComplianceFindingSchema>;

// ---------- Unenforceability / unjust transactions findings ----------

export const BankUnenforceabilityEffect = z.enum([
  "void",
  "voidable_at_borrower_election",
  "unenforceable_until_remedied",
  "court_may_reopen",
  "right_to_recover",
  "right_to_terminate",
  "unfair_term_and_voidable",
]);
export type BankUnenforceabilityEffect = z.infer<typeof BankUnenforceabilityEffect>;

export const BankUnenforceabilityFindingSchema = z.object({
  ruleId: z.string(),
  trigger: z.object({
    act: z.string().describe("e.g. 'National Credit Code (Sch 1 NCCP Act 2009 (Cth))'"),
    section: z.string(),
  }),
  doctrine: z.enum([
    "ncc_unjust_transaction_s76",
    "ncc_unconscionable_interest_s78",
    "ncc_change_unjust_s77",
    "acl_unconscionable_s20",
    "acl_unconscionable_business_s21",
    "acl_misleading_s18",
    "acl_uct_pt2_3",
    "garcia_volunteer_guarantee",
    "amadio_special_disadvantage",
    "ppsa_unperfected_vesting_s267",
    "common_law_penalty",
    "other",
  ]),
  lenderConductOrTerm: z.string(),
  detectionSignals: z.array(z.string()).default([]),
  affectedClauses: z.array(z.string()).default([]),
  effect: BankUnenforceabilityEffect,
  estimatedExposureAud: z.number().nullable(),
  evidence: z.array(z.string()).default([]),
  remedyForBorrower: z.string(),
  citations: z.array(CitationSchema).default([]),
  severity: Severity,
  confidence: z.number().min(0).max(1),
  needsLawyerConfirm: z.boolean().default(false),
});
export type BankUnenforceabilityFinding = z.infer<typeof BankUnenforceabilityFindingSchema>;

// ---------- Capability synthesis outputs ----------

export const RepaymentScenarioSchema = z.object({
  label: z.string().describe("e.g. 'Base case', '+1% rate', '+3% rate', 'IO → P&I'"),
  monthlyRepayment: MoneySchema,
  totalInterestOverTerm: MoneySchema.optional(),
  effectiveRatePct: z.number().optional(),
  notes: z.string().optional(),
});
export type RepaymentScenario = z.infer<typeof RepaymentScenarioSchema>;

export const FeeLadderRowSchema = z.object({
  scenario: z.string().describe("e.g. 'Borrower repays in year 2', 'default for 30 days'"),
  fees: z
    .array(
      z.object({
        description: z.string(),
        amount: MoneySchema,
      }),
    )
    .default([]),
  totalAud: z.number(),
});
export type FeeLadderRow = z.infer<typeof FeeLadderRowSchema>;

export const CovenantSummarySchema = z.object({
  description: z.string(),
  threshold: z.string().describe("e.g. 'ICR ≥ 1.50x', 'LVR ≤ 60%', 'min revenue $5m p.a.'"),
  testFrequency: z.string().optional(),
  consequenceOfBreach: z.string(),
  cureRights: z.string().optional(),
  severity: Severity,
});
export type CovenantSummary = z.infer<typeof CovenantSummarySchema>;

export const CrossDefaultMapSchema = z.object({
  hasCrossDefault: z.boolean(),
  description: z.string().optional(),
  affectedFacilities: z.array(z.string()).default([]),
  groupCompanyImpact: z
    .boolean()
    .default(false)
    .describe("True if a related entity's default can trigger this facility"),
  borrowerSurprises: z
    .array(z.string())
    .default([])
    .describe("Specific surprise outcomes the borrower should be alerted to"),
});
export type CrossDefaultMap = z.infer<typeof CrossDefaultMapSchema>;

export const RegulatoryHookSchema = z.object({
  regime: z.enum([
    "afca_external_dispute_resolution",
    "ncc_hardship_notice",
    "asic_banking_code",
    "code_of_banking_practice_2025",
    "small_business_lending_code",
    "afca_systemic_issue",
    "other",
  ]),
  description: z.string(),
  borrowerAvailable: z
    .boolean()
    .describe(
      "True if the protection is available to this borrower based on classification (consumer / small business / commercial)",
    ),
  howToInvoke: z.string().optional(),
});
export type RegulatoryHook = z.infer<typeof RegulatoryHookSchema>;

// ---------- Letter of advice ----------

export const BankDocsLetterSectionId = z.enum([
  "summary",
  "classification",
  "particulars",
  "interest_and_repayments",
  "securities_and_guarantees",
  "fees_and_costs",
  "default_and_enforcement",
  "borrower_adverse_clauses",
  "guarantor_protections",
  "ncc_compliance",
  "acl_unfair_terms",
  "ppsa_assessment",
  "unenforceability",
  "repayment_scenarios",
  "covenant_dashboard",
  "cross_default_map",
  "regulatory_hooks",
  "proposed_amendments_schedule",
  "next_steps",
]);
export type BankDocsLetterSectionId = z.infer<typeof BankDocsLetterSectionId>;

export const BankDocsLetterSectionSchema = z.object({
  id: BankDocsLetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});
export type BankDocsLetterSection = z.infer<typeof BankDocsLetterSectionSchema>;

export const BankDocsLetterSchema = z.object({
  clientName: z.string(),
  clientRole: z.enum(["borrower", "guarantor"]).default("borrower"),
  facilityRef: z.string().optional(),
  date: z.string(),
  sections: z.array(BankDocsLetterSectionSchema),
});
export type BankDocsLetter = z.infer<typeof BankDocsLetterSchema>;

// ---------- Persisted review record ----------

export const BankDocsReviewStatus = z.enum([
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
export type BankDocsReviewStatus = z.infer<typeof BankDocsReviewStatus>;

export const BankDocsReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("bank_docs").default("bank_docs"),
  createdAt: z.string(),
  status: BankDocsReviewStatus,
  jurisdiction: Jurisdiction.default("VIC"),
  extraction: BankDocsExtractionBundleSchema.optional(),
  compliance: z.array(BankDocComplianceFindingSchema).default([]),
  unenforceability: z.array(BankUnenforceabilityFindingSchema).default([]),
  repaymentScenarios: z.array(RepaymentScenarioSchema).default([]),
  feeLadder: z.array(FeeLadderRowSchema).default([]),
  covenants: z.array(CovenantSummarySchema).default([]),
  crossDefault: CrossDefaultMapSchema.optional(),
  regulatoryHooks: z.array(RegulatoryHookSchema).default([]),
  letter: BankDocsLetterSchema.optional(),
  error: z.string().optional(),
});
export type BankDocsReview = z.infer<typeof BankDocsReviewSchema>;
