import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";
import { CitationSchema, Severity } from "./review";

/**
 * Powers of Attorney review — VIC: Powers of Attorney Act 2014 (PoA Act),
 * Medical Treatment Planning and Decisions Act 2016, Guardianship and
 * Administration Act 2019, and the equity / fiduciary-duty overlay.
 *
 * Validity hinges on:
 *   - PoA Act ss 22-23 — principal capacity at the time of making
 *   - PoA Act ss 31, 33-35 — formal requirements (writing, signature,
 *     witnesses, prescribed form)
 *   - PoA Act s 41 — attorney's statement of acceptance
 *   - PoA Act ss 63-67 — duties of an attorney; conflict-of-interest rules
 *   - PoA Act s 81 — revocation
 *
 * Abuse / red-flag overlay (substantive review):
 *   - Conflict-of-interest gifts / transactions to attorney or related party
 *   - Suspected pressure / coercion at signing (Yerkey, Bridgewater v Leahy)
 *   - Diminished capacity at execution (Banks v Goodfellow analogue for POAs)
 *   - Joint vs joint-and-several attorneys — disagreement deadlock
 *   - VCAT review jurisdiction triggers (PoA Act Pt 7)
 */

// ---------- Classification ----------

export const PoaKindSchema = z.enum([
  "general_non_enduring",
  "general_enduring",
  "financial_enduring",
  "personal_enduring",
  "medical_treatment_decision_maker",
  "supportive",
  "appointment_of_enduring_guardian",
  "company_poa",
  "unknown",
]);
export type PoaKind = z.infer<typeof PoaKindSchema>;

export const PoaClassificationSchema = z.object({
  kind: PoaKindSchema,
  isEnduring: z.boolean(),
  scopeFinancial: z.boolean(),
  scopePersonal: z.boolean(),
  scopeMedical: z.boolean(),
  formIsStatutoryPrescribed: z.boolean().describe("True if it follows the prescribed form in PoA Regulations 2015"),
  multipleAttorneys: z.boolean(),
  appointmentMode: z.enum(["sole", "joint", "joint_and_several", "majority", "alternating", "n/a"]).default("n/a"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type PoaClassification = z.infer<typeof PoaClassificationSchema>;

// ---------- Parties ----------

export const PoaPersonSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  capacityNote: z.string().optional(),
});
export type PoaPerson = z.infer<typeof PoaPersonSchema>;

export const PoaAttorneySchema = z.object({
  name: z.string(),
  role: z.enum(["primary", "alternate", "supportive", "other"]).default("primary"),
  relationshipToPrincipal: z.string().optional(),
  acceptanceSigned: z.boolean(),
  acceptanceDate: z.string().optional(),
  conflictOfInterestDisclosed: z.boolean().default(false),
  conflictOfInterestDescription: z.string().optional(),
});
export type PoaAttorney = z.infer<typeof PoaAttorneySchema>;

export const PoaWitnessSchema = z.object({
  name: z.string(),
  qualification: z.enum([
    "authorised_witness",
    "registered_medical_practitioner",
    "person_authorised_to_witness_affidavits",
    "lawyer",
    "police_officer",
    "other",
    "unknown",
  ]),
  signatureDate: z.string().optional(),
  certificateOfWitnessIncluded: z.boolean().default(false),
});
export type PoaWitness = z.infer<typeof PoaWitnessSchema>;

// ---------- Extraction ----------

export const PoaExtractionSchema = z.object({
  classification: PoaClassificationSchema,
  principal: PoaPersonSchema,
  attorneys: z.array(PoaAttorneySchema).default([]),
  witnesses: z.array(PoaWitnessSchema).default([]),
  executionDate: z.string().optional(),
  effectiveTrigger: z.enum([
    "immediately_on_signing",
    "on_loss_of_decision_making_capacity",
    "specified_event",
    "specified_date",
    "unknown",
  ]).default("unknown"),
  scopeDescription: z.string().optional().describe("Verbatim scope clause"),
  conditionsAndLimitations: z.array(z.string()).default([]),
  giftAuthorisations: z
    .array(z.string())
    .default([])
    .describe("Express authorisation of gifts to attorney / family — high-risk under s 64"),
  conflictTransactionAuthorisations: z
    .array(z.string())
    .default([])
    .describe("Express authorisation of conflict transactions per s 65"),
  remunerationProvisions: z
    .array(z.string())
    .default([])
    .describe("Attorney remuneration clauses per s 70"),
  revocationClauses: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]).describe("Other notable extractions"),
});
export type PoaExtraction = z.infer<typeof PoaExtractionSchema>;

// ---------- Validity assessment ----------

export const PoaValidityCheckSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  remediation: z.string().optional().describe("How to fix or what action solicitor should take"),
});
export type PoaValidityCheck = z.infer<typeof PoaValidityCheckSchema>;

// ---------- Red-flag findings (abuse / equity overlay) ----------

export const PoaRedFlagSchema = z.object({
  id: z.string(),
  severity: Severity,
  category: z.enum([
    "capacity_doubt",
    "undue_influence",
    "conflict_of_interest",
    "self_dealing",
    "missing_acceptance",
    "witness_irregularity",
    "scope_overreach",
    "joint_appointment_deadlock",
    "elder_abuse_indicator",
    "other",
  ]),
  title: z.string(),
  explanation: z.string(),
  signals: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  recommendedAction: z.string(),
  citations: z.array(CitationSchema).default([]),
  needsLawyerConfirm: z.boolean().default(true),
});
export type PoaRedFlag = z.infer<typeof PoaRedFlagSchema>;

// ---------- Compliance / rule findings ----------

export const PoaComplianceFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
});
export type PoaComplianceFinding = z.infer<typeof PoaComplianceFindingSchema>;

// ---------- Letter ----------

export const PoaLetterSectionId = z.enum([
  "summary",
  "classification",
  "parties",
  "execution_and_witnessing",
  "scope_and_conditions",
  "validity",
  "red_flags",
  "compliance",
  "vcat_review_options",
  "remediation_steps",
  "next_steps",
]);
export type PoaLetterSectionId = z.infer<typeof PoaLetterSectionId>;

export const PoaLetterSectionSchema = z.object({
  id: PoaLetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});

export const PoaLetterSchema = z.object({
  clientName: z.string(),
  clientRole: z.enum(["principal", "attorney", "interested_party"]).default("principal"),
  date: z.string(),
  sections: z.array(PoaLetterSectionSchema),
});
export type PoaLetter = z.infer<typeof PoaLetterSchema>;

// ---------- Persisted review ----------

export const PoaReviewStatus = z.enum([
  "pending",
  "classifying",
  "extracting",
  "checking_validity",
  "detecting_red_flags",
  "composing_letter",
  "complete",
  "failed",
]);
export type PoaReviewStatus = z.infer<typeof PoaReviewStatus>;

export const PoaReviewSchema = z.object({
  id: z.string(),
  kind: z.literal("poa").default("poa"),
  createdAt: z.string(),
  status: PoaReviewStatus,
  jurisdiction: Jurisdiction.default("VIC"),
  extraction: PoaExtractionSchema.optional(),
  validityChecks: z.array(PoaValidityCheckSchema).default([]),
  compliance: z.array(PoaComplianceFindingSchema).default([]),
  redFlags: z.array(PoaRedFlagSchema).default([]),
  letter: PoaLetterSchema.optional(),
  error: z.string().optional(),
});
export type PoaReview = z.infer<typeof PoaReviewSchema>;
