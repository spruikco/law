import { z } from "zod";
import { Jurisdiction } from "./jurisdiction";

// ---------- Shared primitives ----------

export const MoneySchema = z.object({
  amount: z.number(),
  currency: z.literal("AUD").default("AUD"),
  raw: z
    .string()
    .optional()
    .describe(
      "Original text as written in the document (for extraction-based modules)",
    ),
});
export type Money = z.infer<typeof MoneySchema>;

export const PartySchema = z.object({
  role: z.enum(["vendor", "purchaser", "vendor_agent", "purchaser_agent", "other"]),
  name: z.string(),
  acn_or_abn: z.string().optional(),
  address: z.string().optional(),
});
export type Party = z.infer<typeof PartySchema>;

export const CitationSchema = z.object({
  act: z.string().describe("e.g. 'Sale of Land Act 1962 (Vic)'"),
  section: z.string().describe("e.g. '32(2)(a)'"),
  // Coerce empty strings to undefined — Claude often emits "" for an unknown
  // URL, which would otherwise fail the URL validator.
  url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  quotedText: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

// ---------- Pass 1 output: document classification ----------

export const DocumentKind = z.enum([
  "contract_of_sale",
  "section_32",
  "owners_corporation_certificate",
  "title_search",
  "land_tax_certificate",
  "unknown",
]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const ClassifiedDocumentSchema = z.object({
  sourceFilename: z.string(),
  kind: DocumentKind,
  pageRange: z
    .object({ start: z.number().int(), end: z.number().int() })
    .optional(),
  confidence: z.number().min(0).max(1),
});
export type ClassifiedDocument = z.infer<typeof ClassifiedDocumentSchema>;

// ---------- Pass 2 outputs: structured extraction ----------

export const ParticularsSchema = z.object({
  propertyAddress: z.string(),
  titleReference: z.string().optional(),
  price: MoneySchema,
  deposit: MoneySchema,
  balance: MoneySchema.optional(),
  settlementDate: z.string().describe("ISO date or 'X days from contract'"),
  parties: z.array(PartySchema),
  gstTreatment: z.string().optional(),
});
export type Particulars = z.infer<typeof ParticularsSchema>;

export const SpecialConditionSchema = z.object({
  number: z.string().describe("e.g. '1', '2.1', 'SC3'"),
  heading: z.string().optional(),
  fullText: z.string(),
  summary: z.string(),
  category: z.enum([
    "conditions_precedent",
    "finance",
    "building_inspection",
    "pest_inspection",
    "sunset",
    "deposit",
    "variation_of_general_condition",
    "indemnity",
    "time_of_essence",
    "other",
  ]),
  variesGeneralCondition: z
    .string()
    .optional()
    .describe("If this SC varies a general condition, the GC number being varied"),
});
export type SpecialCondition = z.infer<typeof SpecialConditionSchema>;

export const GeneralConditionsRefSchema = z.object({
  standardForm: z.string().describe("e.g. 'LIV/REIV Contract of Sale of Real Estate'"),
  version: z.string().describe("e.g. '2019'"),
});
export type GeneralConditionsRef = z.infer<typeof GeneralConditionsRefSchema>;

export const ServicesDisclosureSchema = z.object({
  /** Each service: connected=true means the box was NOT marked (service is connected). The s32 X-box indicates NOT connected. */
  services: z.array(
    z.object({
      service: z.enum([
        "electricity",
        "gas",
        "water",
        "sewerage",
        "telephone",
        "other",
      ]),
      otherName: z.string().optional(),
      connected: z.boolean(),
      disclosureMarked: z
        .boolean()
        .describe("Whether an X was marked in the s32 disclosure box"),
    }),
  ),
});
export type ServicesDisclosure = z.infer<typeof ServicesDisclosureSchema>;

export const OwnersCorpSchema = z.object({
  applies: z.boolean(),
  planNumber: z.string().optional(),
  ocManager: z.string().optional(),
  annualFees: MoneySchema.optional(),
  specialLevies: z.array(
    z.object({
      description: z.string(),
      amount: MoneySchema.optional(),
      dueDate: z.string().optional(),
    }),
  ).default([]),
  flaggedFutureObligations: z.array(z.string()).default([]),
  damageToProperty: z.array(z.string()).default([]),
  recentMeetingsSummary: z.string().optional(),
  certificateAttached: z.boolean(),
});
export type OwnersCorp = z.infer<typeof OwnersCorpSchema>;

export const TitleSearchSchema = z.object({
  volumeFolio: z.string().optional(),
  registeredProprietors: z.array(z.string()).default([]),
  encumbrances: z.array(z.string()).default([]),
  easements: z.array(z.string()).default([]),
  covenants: z.array(z.string()).default([]),
  mortgages: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
});
export type TitleSearch = z.infer<typeof TitleSearchSchema>;

export const LandTaxCertSchema = z.object({
  applicable: z.boolean(),
  assessmentYear: z.string().optional(),
  amountOwing: MoneySchema.optional(),
  commercialIndicators: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type LandTaxCert = z.infer<typeof LandTaxCertSchema>;

export const ExtractionBundleSchema = z.object({
  particulars: ParticularsSchema,
  specialConditions: z.array(SpecialConditionSchema),
  generalConditions: GeneralConditionsRefSchema.optional(),
  servicesDisclosure: ServicesDisclosureSchema,
  ownersCorp: OwnersCorpSchema,
  titleSearch: TitleSearchSchema,
  landTaxCert: LandTaxCertSchema.optional(),
});
export type ExtractionBundle = z.infer<typeof ExtractionBundleSchema>;

// ---------- Pass 3 output: compliance findings ----------

export const Severity = z.enum(["info", "low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const ComplianceFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["pass", "fail", "warning", "needs_review"]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  citations: z.array(CitationSchema).default([]),
  sourceRefs: z.array(z.string()).default([]).describe("Pointers back to extracted data"),
});
export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

// ---------- Pass 4 output: risk analysis ----------

export const RiskFindingSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "condition_precedent",
    "risky_special_condition",
    "general_condition_variation",
    "tax_implication",
    "title_issue",
    "other",
  ]),
  severity: Severity,
  title: z.string(),
  explanation: z.string(),
  /** For general-condition variations: the net effect in plain English */
  netEffect: z.string().optional(),
  citations: z.array(CitationSchema).default([]),
  specialConditionNumber: z.string().optional(),
  generalConditionNumber: z.string().optional(),
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

// ---------- Pass 5 output: letter of advice ----------

export const LetterSectionId = z.enum([
  "summary",
  "particulars",
  "conditions_precedent",
  "risky_special_conditions",
  "variations_to_general_conditions",
  "missing_disclosures",
  "owners_corp_red_flags",
  "tax_implications",
  "next_steps",
]);
export type LetterSectionId = z.infer<typeof LetterSectionId>;

export const LetterSectionSchema = z.object({
  id: LetterSectionId,
  heading: z.string(),
  markdown: z.string(),
});
export type LetterSection = z.infer<typeof LetterSectionSchema>;

export const LetterSchema = z.object({
  clientName: z.string(),
  propertyAddress: z.string(),
  date: z.string().describe("ISO date"),
  sections: z.array(LetterSectionSchema),
});
export type Letter = z.infer<typeof LetterSchema>;

// ---------- Review record (persisted) ----------

export const ReviewStatus = z.enum([
  "pending",
  "classifying",
  "extracting",
  "checking_compliance",
  "analysing_risk",
  "composing_letter",
  "complete",
  "failed",
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const ReviewSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: ReviewStatus,
  jurisdiction: Jurisdiction.default("VIC"),
  documents: z.array(ClassifiedDocumentSchema),
  extraction: ExtractionBundleSchema.optional(),
  compliance: z.array(ComplianceFindingSchema).default([]),
  risks: z.array(RiskFindingSchema).default([]),
  letter: LetterSchema.optional(),
  error: z.string().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;
