import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, Severity } from "./review";

/**
 * Wills review — VIC: Wills Act 1997, Administration and Probate Act 1958,
 * informal-execution under Wills Act s 9, family-provision under AP Act Pt IV.
 *
 * Validity hinges on:
 *   - Wills Act 1997 (Vic) s 7 — execution formalities (signed, two witnesses
 *     present at the same time, both sign in testator's presence)
 *   - Wills Act s 5 — testamentary capacity (Banks v Goodfellow)
 *   - Wills Act s 8A — knowledge and approval
 *   - Wills Act s 9 — informal-execution dispensing power
 *   - Wills Act s 13 — interested-witness rule and exceptions
 *
 * Substantive review:
 *   - Beneficiary clarity (no patent/latent ambiguity), residue catch-all
 *   - Executors + alternates appointed, willing, eligible (s 17 AP Act)
 *   - Family-provision exposure under AP Act Pt IV — "eligible person"
 *     classes per s 90, moral-duty assessment (Vigolo v Bostin)
 *   - Tax / superannuation interaction (binding death-benefit nominations)
 *   - Mutual-wills doctrine, equity overlays
 */

// ---------- Classification ----------

export const WillKindSchema = z.enum([
  "formal_will",
  "codicil",
  "informal_document_s9",
  "mutual_will",
  "international_will",
  "statutory_will",
  "unknown",
]);
export type WillKind = z.infer<typeof WillKindSchema>;

export const WillClassificationSchema = z.object({
  kind: WillKindSchema,
  isHomeMade: z.boolean().describe("True if not solicitor-prepared / no firm letterhead"),
  hasFormalAttestation: z
    .boolean()
    .describe("True if attestation clause + 2 witnesses present"),
  appearsRevoked: z.boolean().default(false),
  hasInternationalElement: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type WillClassification = z.infer<typeof WillClassificationSchema>;

// ---------- Parties ----------

export const WillTestatorSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  occupation: z.string().optional(),
  capacityNote: z.string().optional(),
});
export type WillTestator = z.infer<typeof WillTestatorSchema>;

export const WillExecutorSchema = z.object({
  name: z.string(),
  role: z.enum(["primary", "alternate", "co", "trustee"]).default("primary"),
  relationshipToTestator: z.string().optional(),
  isBeneficiary: z.boolean().default(false),
  remunerationProvided: z.boolean().default(false),
});
export type WillExecutor = z.infer<typeof WillExecutorSchema>;

export const WillWitnessSchema = z.object({
  name: z.string(),
  occupation: z.string().optional(),
  address: z.string().optional(),
  isBeneficiaryOrSpouseOfBeneficiary: z
    .boolean()
    .default(false)
    .describe("Wills Act s 13 — interested witness; gift voidable unless saved by s 13(2)-(4)"),
});
export type WillWitness = z.infer<typeof WillWitnessSchema>;

export const WillBeneficiarySchema = z.object({
  name: z.string(),
  relationshipToTestator: z.string().optional(),
  giftType: z.enum(["specific", "demonstrative", "general", "pecuniary", "residuary"]),
  description: z.string().describe("Verbatim description of the gift"),
  isContingent: z.boolean().default(false),
  contingencyDescription: z.string().optional(),
  ademptionRisk: z.boolean().default(false).describe("Specific gift that may not exist at death"),
  isEligibleAPActPt4: z
    .boolean()
    .default(false)
    .describe("True if beneficiary is in eligible-person class under AP Act s 90"),
});
export type WillBeneficiary = z.infer<typeof WillBeneficiarySchema>;

// ---------- Extraction ----------

export const WillExtractionSchema = z.object({
  classification: WillClassificationSchema,
  testator: WillTestatorSchema,
  executionDate: z.string().optional(),
  placeOfExecution: z.string().optional(),
  executors: z.array(WillExecutorSchema).default([]),
  witnesses: z.array(WillWitnessSchema).default([]),
  beneficiaries: z.array(WillBeneficiarySchema).default([]),
  hasResidueClause: z.boolean().default(false),
  residueDescription: z.string().optional(),
  hasGuardianshipClause: z.boolean().default(false),
  guardianshipDescription: z.string().optional(),
  hasFuneralDirections: z.boolean().default(false),
  funeralDirections: z.string().optional(),
  bindingDeathBenefitNominations: z.array(z.string()).default([]),
  superFundsReferenced: z.array(z.string()).default([]),
  testamentaryTrustsReferenced: z.array(z.string()).default([]),
  revocationClause: z.string().optional(),
  hasAttestationClause: z.boolean().default(false),
  attestationClauseText: z.string().optional(),
  observations: z.array(z.string()).default([]),
});
export type WillExtraction = z.infer<typeof WillExtractionSchema>;

// ---------- Findings ----------

export const WillFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  category: z.enum([
    "execution",
    "capacity",
    "knowledge_and_approval",
    "interested_witness",
    "beneficiary_clarity",
    "residue",
    "executor",
    "family_provision",
    "ademption",
    "informal_s9",
    "tax_super",
    "revocation",
    "mutual_wills",
    "other",
  ]),
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional(),
});
export type WillFinding = z.infer<typeof WillFindingSchema>;

// ---------- Family-provision exposure (AP Act Pt IV) ----------

export const FamilyProvisionRiskSchema = z.object({
  eligiblePerson: z.string().describe("Person who may bring a TFM claim"),
  eligibilityCategory: z.enum([
    "spouse_or_domestic_partner",
    "former_spouse_or_domestic_partner",
    "child_under_18",
    "child_over_18_dependent",
    "child_assuming_responsibility",
    "stepchild_under_18",
    "stepchild_over_18_dependent",
    "registered_caring_partner",
    "grandchild_dependent",
    "household_member",
    "not_eligible",
  ]),
  severity: Severity,
  reasoning: z.string(),
  estimatedExposure: z.string().optional().describe("Magnitude of likely award"),
  mitigations: z.array(z.string()).default([]),
});
export type FamilyProvisionRisk = z.infer<typeof FamilyProvisionRiskSchema>;

// ---------- Letter ----------

export const WillLetterSectionId = z.enum([
  "summary",
  "classification",
  "execution_validity",
  "testator_capacity",
  "executors_and_witnesses",
  "beneficiaries_and_gifts",
  "residue",
  "informal_execution_s9",
  "family_provision_exposure",
  "tax_super_interaction",
  "remediation_steps",
  "next_steps",
]);
export type WillLetterSectionId = z.infer<typeof WillLetterSectionId>;

export const WillLetterSectionSchema = z.object({
  id: WillLetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const WillLetterSchema = z.object({
  clientName: z.string(),
  clientRole: z
    .enum(["testator", "executor", "beneficiary", "interested_party"])
    .default("testator"),
  date: z.string(),
  sections: z.array(WillLetterSectionSchema),
});
export type WillLetter = z.infer<typeof WillLetterSchema>;

// ---------- Persisted review ----------

export const WillExecutionStatusSchema = z.enum([
  "valid",
  "informal_curable_s9",
  "invalid",
  "unknown",
]);
export type WillExecutionStatus = z.infer<typeof WillExecutionStatusSchema>;

export const WillReviewStatus = z.enum([
  "pending",
  "classifying",
  "extracting",
  "checking_validity",
  "analysing_family_provision",
  "composing_letter",
  "complete",
  "failed",
]);
export type WillReviewStatus = z.infer<typeof WillReviewStatus>;

export const WillReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("will").default("will"),
  createdAt: z.string(),
  status: WillReviewStatus,
  jurisdiction: Jurisdiction.default("VIC"),
  extraction: WillExtractionSchema.optional(),
  executionStatus: WillExecutionStatusSchema.default("unknown"),
  findings: z.array(WillFindingSchema).default([]),
  familyProvisionRisks: z.array(FamilyProvisionRiskSchema).default([]),
  letter: WillLetterSchema.optional(),
  error: z.string().optional(),
});
export type WillReview = z.infer<typeof WillReviewSchema>;
