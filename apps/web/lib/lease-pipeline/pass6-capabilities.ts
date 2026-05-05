import type Anthropic from "@anthropic-ai/sdk";
import {
  CommentaryRiskFindingSchema,
  LandlordNotificationObligationSchema,
  LeaseChainAnalysisSchema,
  LivVersionAnalysisSchema,
  MakeGoodCostBandSchema,
  MarketReviewProjectionSchema,
  OptionExerciseAnalysisSchema,
  PlanningComplianceSchema,
  type CommentaryRiskFinding,
  type LandlordNotificationObligation,
  type LeaseChainAnalysis,
  type LeaseExtractionBundle,
  type LivVersionAnalysis,
  type MakeGoodCostBand,
  type MarketReviewProjection,
  type OptionExerciseAnalysis,
  type PlanningCompliance,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

/**
 * Pass 6 — Capability synthesis (PRJ-693 capabilities 2, 3, 4, 7, 8, 9, 10, 11).
 *
 * Mostly deterministic from the extraction bundle. Two LLM calls:
 *   - parseOptionAnalyses — turn each option-term string into a structured analysis
 *   - detectLivVersion    — heuristic LIV form detection from lease text
 *
 * Capabilities 3 (planning) and 10 (commentary) ship with stub implementations
 * pending external data (VicPlan API, indexed Sam Hopper article corpus).
 */

// =====================================================================
// Capability 2 — make-good cost banding (deterministic)
// =====================================================================

export function computeMakeGoodCostBand(
  bundle: LeaseExtractionBundle,
): MakeGoodCostBand | undefined {
  const mg = bundle.makeGood;
  if (!mg.present) return undefined;

  const band = mg.severityRating ?? "moderate";
  // Indicative bands — refined when QS partner data is wired in (capability 2 open question).
  const ranges: Record<typeof band, { low?: number; high?: number; qs: boolean }> = {
    light: { low: 5_000, high: 15_000, qs: false },
    moderate: { low: 20_000, high: 60_000, qs: false },
    heavy: { low: 80_000, high: 250_000, qs: true },
    bare_shell: { low: undefined, high: undefined, qs: true },
  } as const;
  const r = ranges[band];

  return MakeGoodCostBandSchema.parse({
    band,
    estimateLowAud: r.low,
    estimateHighAud: r.high,
    basis:
      band === "bare_shell"
        ? "Bare-shell strip-back: cost varies widely with premises size and fit-out (often six figures). A quantity surveyor estimate is essential."
        : `Indicative band for ${band} make-good — derived from severity rating only. For a binding estimate, brief a quantity surveyor.`,
    qsReferralRecommended: r.qs,
  });
}

// =====================================================================
// Capability 4 — market rent review projections (deterministic)
// =====================================================================

export function computeMarketReviewProjections(
  bundle: LeaseExtractionBundle,
): MarketReviewProjection[] {
  const items = bundle.items;
  const baseline = items.commencingRent;
  if (!baseline) return [];

  const review = items.rentReview;
  const optionTerms = items.optionTerms;
  if (optionTerms.length === 0) return [];

  // Try to derive a projection method from the review clause
  const desc = (review?.description ?? "").toLowerCase();
  const method = review?.method;
  let stepLow = 0;
  let stepHigh = 0;
  let basis: MarketReviewProjection["basis"] = "insufficient_data";
  let notes = "";

  // Look for "X%" in description
  const pctMatch = desc.match(/([\d.]+)\s*%/);
  if (method === "fixed_percent" && pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    stepLow = pct / 100;
    stepHigh = pct / 100;
    basis = "fixed_uplift_compounded";
    notes = `Fixed-percent uplift of ${pct}% applied annually until next further-term commencement.`;
  } else if (method === "cpi") {
    // Melbourne all-groups CPI — long-term average ~2.5%, recent print elevated.
    stepLow = 0.025;
    stepHigh = 0.04;
    basis = "cpi_extrapolation";
    notes =
      "CPI-extrapolation using Melbourne All-Groups CPI long-term band (2.5%–4%). Lawyer should confirm the contractual CPI series and timing.";
  } else if (method === "market") {
    // Per RLA s37 — specialist retail valuer determination on dispute.
    stepLow = 0.05;
    stepHigh = 0.25;
    basis = "market_band";
    notes =
      "Market reviews under s37 RLA can step the rent ±5–25% in a single review. We recommend the tenant budget for a valuation under s37 if the review is disputed.";
  } else if (method === "fixed_amount") {
    basis = "insufficient_data";
    notes =
      "Fixed-amount review — projection requires the dollar amount per review date which we did not extract. Lawyer to confirm.";
  } else if (method === "greater_of") {
    stepLow = 0.025;
    stepHigh = 0.06;
    basis = "cpi_extrapolation";
    notes =
      "Greater-of review (e.g. CPI vs fixed %) — projected to the upper of the two bases. Note: combined methods at a single review are problematic under s35 RLA for retail leases.";
  } else {
    basis = "insufficient_data";
    notes = "Review method not extractable; projection deferred.";
  }

  // Compound from baseline by years between term start and each option commencement.
  // We don't have option-start ISO dates, so we use a placeholder: year 6 / 11 / 16…
  const startYear = items.termYears ?? 5;
  const projections: MarketReviewProjection[] = [];
  let yearOffset = startYear;
  for (let i = 0; i < optionTerms.length; i++) {
    const yearsFromStart = yearOffset;
    const compoundLow = Math.pow(1 + stepLow, yearsFromStart);
    const compoundHigh = Math.pow(1 + stepHigh, yearsFromStart);
    projections.push(
      MarketReviewProjectionSchema.parse({
        optionTermLabel: `Further term ${i + 1} — yr ${yearsFromStart + 1}+`,
        baselineRent: baseline,
        projectedRangeLow: {
          amount: Math.round(baseline.amount * compoundLow),
          currency: "AUD",
          raw: `~$${Math.round(baseline.amount * compoundLow).toLocaleString("en-AU")} (low projection)`,
        },
        projectedRangeHigh: {
          amount: Math.round(baseline.amount * compoundHigh),
          currency: "AUD",
          raw: `~$${Math.round(baseline.amount * compoundHigh).toLocaleString("en-AU")} (high projection)`,
        },
        basis,
        notes: `${notes} Projected to commencement of ${optionTerms[i]}.`,
      }),
    );
    // Assume each further term is also `startYear` long
    yearOffset += startYear;
  }
  return projections;
}

// =====================================================================
// Capability 7 — landlord notification obligations (deterministic statutory list)
// =====================================================================

export function computeNotificationObligations(
  bundle: LeaseExtractionBundle,
): LandlordNotificationObligation[] {
  const out: LandlordNotificationObligation[] = [];
  const rlaApplies = bundle.classification.rlaApplies;

  if (rlaApplies) {
    out.push(
      LandlordNotificationObligationSchema.parse({
        source: "statutory",
        description:
          "Disclosure statement and proposed lease — must be given to the tenant.",
        citation: {
          act: "Retail Leases Act 2003 (Vic)",
          section: "17(1)",
          url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003/044#section-17",
        },
        timing: "≥14 days before the lease is entered into",
        consequenceOfFailure:
          "Tenant may withhold rent until disclosure given (s17(3)). Term taken to commence 14 days after disclosure given (s17(1C)). Right of termination if disclosure misleading or incomplete (s17(5)–(6)).",
        status: "unknown",
      }),
    );

    if (bundle.items.optionTerms.length > 0) {
      out.push(
        LandlordNotificationObligationSchema.parse({
          source: "statutory",
          description:
            "Option-to-renew notice — landlord must notify tenant of last day to exercise, rent for first 12 months of renewed term, availability of early rent review and cooling-off, and any disclosure changes.",
          citation: {
            act: "Retail Leases Act 2003 (Vic)",
            section: "28(1A)",
            url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003/044#section-28",
          },
          timing: "≥3 months before the last date the option may be exercised",
          consequenceOfFailure:
            "Option exercise window extended to 3 months from notice (s28(2)(a)); lease may continue on same terms until that date (s28(2)(b)); tenant may terminate (s28(2)(c)).",
          status: "upcoming",
        }),
      );
    }

    if (bundle.outgoings.payable) {
      out.push(
        LandlordNotificationObligationSchema.parse({
          source: "statutory",
          description:
            "Estimate of outgoings — written, itemised, given before each accounting period.",
          citation: {
            act: "Retail Leases Act 2003 (Vic)",
            section: "46",
            url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003/044#section-46",
          },
          timing:
            "Before lease entered into, then ≥1 month before the start of each accounting period",
          consequenceOfFailure:
            "Tenant not liable to contribute to outgoings of which an estimate is required and has not been given (s46(4)).",
          status: "unknown",
        }),
        LandlordNotificationObligationSchema.parse({
          source: "statutory",
          description:
            "Annual outgoings statement (audited per s48 where required).",
          citation: {
            act: "Retail Leases Act 2003 (Vic)",
            section: "47",
          },
          timing:
            "Within 3 months after the end of each accounting period (s47(1))",
          consequenceOfFailure:
            "Tenant may withhold contributions to outgoings until a compliant statement is provided.",
          status: "unknown",
        }),
      );
    }
  }

  // Demolition / relocation obligations are conditional on the lease containing those clauses.
  // Pass 4 (clauses) flags these via additionalProvisions.focusArea === "relocation_demolition".
  const demolitionLikely = bundle.additionalProvisions.some((p) =>
    /demolish|demolition/i.test(p.fullText),
  );
  if (demolitionLikely && rlaApplies) {
    out.push(
      LandlordNotificationObligationSchema.parse({
        source: "statutory",
        description:
          "Demolition termination notice — must include details of a genuine demolition proposal.",
        citation: {
          act: "Retail Leases Act 2003 (Vic)",
          section: "56(2)",
          url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003/044#section-56",
        },
        timing: "≥6 months written notice of the termination date",
        consequenceOfFailure:
          "Termination ineffective; landlord liable to pay reasonable compensation (s56(4)).",
        status: "unknown",
      }),
    );
  }

  // Land-tax notice
  if (rlaApplies) {
    out.push(
      LandlordNotificationObligationSchema.parse({
        source: "statutory",
        description:
          "Notification of amount of land tax recoverable from tenant (where applicable post-1 July 2003).",
        citation: {
          act: "Retail Leases Act 2003 (Vic)",
          section: "121",
        },
        timing:
          "Per s121 — annually with the outgoings statement; recoverability is in any event void per s50",
        consequenceOfFailure:
          "Combined with s50, the tenant is not liable to pay any amount for land tax for which the landlord is the taxpayer.",
        status: "unknown",
      }),
    );
  }

  return out;
}

// =====================================================================
// Capability 8 — option exercise risk + timeline (LLM-driven)
// =====================================================================

const OPTIONS_TOOL: Anthropic.Tool = {
  name: "record_option_analyses",
  description:
    "Record one OptionExerciseAnalysis for each option-term in the lease. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      analyses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            optionLabel: { type: "string" },
            exerciseWindowOpens: { type: "string" },
            exerciseWindowCloses: { type: "string" },
            exerciseMethod: { type: "string" },
            conditionsToExercise: { type: "array", items: { type: "string" } },
            tenantRisks: { type: "array", items: { type: "string" } },
            landlordRisks: { type: "array", items: { type: "string" } },
            s28EarlyReviewAvailable: { type: "boolean" },
            s28BCoolingOffAvailable: { type: "boolean" },
          },
          required: ["optionLabel", "exerciseMethod"],
        },
      },
    },
    required: ["analyses"],
  },
};

export async function computeOptionAnalyses(
  bundle: LeaseExtractionBundle,
): Promise<OptionExerciseAnalysis[]> {
  if (bundle.items.optionTerms.length === 0) return [];

  const optionsClause = bundle.additionalProvisions
    .filter((p) => p.focusArea === "option_exercise")
    .map((p) => `[${p.number}] ${p.fullText}`)
    .join("\n\n");

  const prompt = `You are analysing the option-to-renew arrangement in a Victorian commercial lease for a TENANT client.

Term: ${bundle.items.termDescription}
Options listed in items: ${bundle.items.optionTerms.join(" · ")}
Lease classification: ${bundle.items.permittedUse} — ${bundle.classification.kind} (RLA applies: ${bundle.classification.rlaApplies})
Commencement date: ${bundle.items.commencementDate ?? "(not extracted)"}

Option-related clauses extracted:
${optionsClause || "(none extracted as additionalProvision; rely on items.optionTerms text)"}

For EACH option, produce one OptionExerciseAnalysis:
- optionLabel — human-friendly label, e.g. "First further term (5 years)"
- exerciseWindowOpens / exerciseWindowCloses — ISO date if derivable, otherwise omit
- exerciseMethod — verbatim from the option clause (or paraphrase if not directly quotable)
- conditionsToExercise — preconditions (e.g. "no breach", "all rent paid"). Quote where possible.
- tenantRisks — bullet points of risks for the tenant: onerous notice form, no break right post-exercise, market rent uplift, rent unknown at time of exercise, etc.
- landlordRisks — bullet points: ${bundle.classification.rlaApplies ? "if no s28(1A) notice given ≥3 months before option deadline, the window extends 3 months from notice and tenant may terminate (s28(2)). " : ""}any other landlord-side timing/process risks.
- s28EarlyReviewAvailable — ${bundle.classification.rlaApplies ? "set true (RLA applies, s28A applies)" : "false (non-retail)"}
- s28BCoolingOffAvailable — ${bundle.classification.rlaApplies ? "set true (RLA applies, s28B applies)" : "false (non-retail)"}

Call record_option_analyses with one entry per option.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 4000,
    tools: [OPTIONS_TOOL],
    tool_choice: { type: "tool", name: "record_option_analyses" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return [];
  }
  const input = toolUse.input as { analyses?: unknown[] };
  return (input.analyses ?? []).map((a) =>
    OptionExerciseAnalysisSchema.parse(a),
  );
}

// =====================================================================
// Capability 3 — planning compliance (stub; VicPlan API integration deferred)
// =====================================================================

export async function computePlanningCompliance(
  bundle: LeaseExtractionBundle,
): Promise<PlanningCompliance | undefined> {
  // v1 stub: emit an "unknown" finding so the letter has a placeholder section
  // pointing the lawyer to the VicPlan report. Keyword scan for permit triggers.
  const use = bundle.items.permittedUse.toLowerCase();
  const triggers: string[] = [];
  if (bundle.items.liquorLicenceRequired) triggers.push("Liquor licence");
  if (/extended|24[- ]hour|late[- ]trading/.test(use)) triggers.push("Extended trading hours");
  if (/restaurant|cafe|food premises/.test(use)) triggers.push("Food premises registration (Food Act 1984)");
  if (/medical|clinic|health/.test(use)) triggers.push("Health practitioner registration");
  if (/place of assembly|education|childcare/.test(use))
    triggers.push("Place of assembly / education permit");

  return PlanningComplianceSchema.parse({
    zone: "Unknown — fetch VicPlan Planning Property Report",
    overlays: [],
    permittedUseAllowed: "unknown",
    permitTriggers: triggers,
    concerns: [
      "v1: VicPlan integration pending. Solicitor should run the Planning Property Report at https://mapshare.vic.gov.au/vicplan/ for the premises address and confirm the Use is allowed under the relevant zone (Sec 1, 2 or 3) and any overlay controls.",
    ],
  });
}

// =====================================================================
// Capability 9 — LIV version detection (LLM-driven)
// =====================================================================

const LIV_TOOL: Anthropic.Tool = {
  name: "record_liv_version",
  description:
    "Record whether this is a Law Institute of Victoria standard-form lease and which version. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      isLiv: { type: "boolean" },
      detectedVersion: {
        type: "string",
        enum: ["2009", "2013", "2017", "2023", "unknown"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
    },
    required: ["isLiv", "confidence"],
  },
};

export async function detectLivVersion(
  uploads: UploadedDocument[],
): Promise<LivVersionAnalysis | undefined> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({
    type: "text",
    text: `Determine whether this lease is based on a Law Institute of Victoria (LIV) standard-form Commercial Lease, and if so which version (2009 / 2013 / 2017 / 2023).

Detection signals:
- Cover-page or footer marking such as "© Law Institute of Victoria" or "LIV Lease – Commercial"
- Clause-numbering style and headings characteristic of the LIV form (e.g. "Clause 1 – Tenant's covenants", definitions block, Schedule reference layout)
- 2023 form notable changes: ESM (essential safety measure) recovery now expressly addressed; updated outgoings drafting
- 2017 form precedes those changes

Call record_liv_version with isLiv (true/false), detectedVersion, confidence and a 1-2 sentence reasoning. v1.5 will compare clause-by-clause against the 2023 baseline; for v1, detection only.`,
  });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1024,
    tools: [LIV_TOOL],
    tool_choice: { type: "tool", name: "record_liv_version" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return undefined;
  const input = toolUse.input as {
    isLiv: boolean;
    detectedVersion?: "2009" | "2013" | "2017" | "2023" | "unknown";
    confidence: number;
  };

  return LivVersionAnalysisSchema.parse({
    isLiv: input.isLiv,
    detectedVersion: input.detectedVersion,
    confidence: input.confidence,
    comparisonAgainst: "2023",
    deltas: [],
  });
}

// =====================================================================
// Capability 10 — Sam Hopper commentary cross-reference (stub)
// =====================================================================

export async function findCommentaryRisks(
  _bundle: LeaseExtractionBundle,
): Promise<CommentaryRiskFinding[]> {
  // v1 stub. Once the Sam Hopper article corpus is ingested at
  // packages/legislation/corpus/commentary/sam-hopper/, this will:
  //   (1) embed the lease's risk surface (focus areas + RLA findings)
  //   (2) retrieve top-N relevant articles
  //   (3) emit one CommentaryRiskFinding per article with biggest tenant/landlord risks
  const _: unknown = CommentaryRiskFindingSchema; // schema referenced for downstream wiring
  return [];
}

// =====================================================================
// Capability 11 — transfer-of-lease chain analysis (heuristic)
// =====================================================================

export function analyseLeaseChain(
  uploads: UploadedDocument[],
): LeaseChainAnalysis | undefined {
  // Only emit if multiple lease-shaped documents were uploaded.
  if (uploads.length < 2) return undefined;

  const isLikelyLeaseDoc = (name: string) =>
    /lease|deed|assignment|consent|disclosure|variation/i.test(name);

  const candidates = uploads.filter((u) => isLikelyLeaseDoc(u.filename));
  if (candidates.length < 2) return undefined;

  const order: LeaseChainAnalysis["documents"] = candidates.map((u, i) => {
    const lower = u.filename.toLowerCase();
    let kind: LeaseChainAnalysis["documents"][number]["kind"] = "other";
    if (/deed.*assignment|assignment of lease/.test(lower)) kind = "deed_of_assignment";
    else if (/deed.*consent|consent.*assignment/.test(lower)) kind = "deed_of_consent";
    else if (/disclosure/.test(lower)) kind = "assignor_disclosure";
    else if (/variation/.test(lower)) kind = "variation";
    else if (/renewal/.test(lower)) kind = "renewal";
    else if (/head.*lease|original.*lease|^lease/.test(lower)) kind = "head_lease";
    return {
      order: i + 1,
      kind,
      parties: [],
      sourceFilename: u.filename,
      summary: `Heuristic detection from filename. Solicitor to confirm document type.`,
    };
  });

  const hasAssignment = order.some((d) => d.kind === "deed_of_assignment");
  const hasConsent = order.some((d) => d.kind === "deed_of_consent");
  const hasDisclosure = order.some((d) => d.kind === "assignor_disclosure");

  const missingDocuments: string[] = [];
  if (hasAssignment && !hasConsent) {
    missingDocuments.push(
      "Landlord's deed of consent to assignment (or evidence of consent)",
    );
  }
  if (hasAssignment && !hasDisclosure) {
    missingDocuments.push(
      "Assignor's disclosure statement to assignee under s61 RLA 2003 (if retail)",
    );
  }
  if (!order.some((d) => d.kind === "head_lease")) {
    missingDocuments.push(
      "Head lease (original lease) — not detected in upload set",
    );
  }

  return LeaseChainAnalysisSchema.parse({
    chainComplete: missingDocuments.length === 0,
    documents: order,
    missingDocuments,
    inconsistencies: [],
  });
}

// =====================================================================
// Pass 6 entrypoint — orchestrates all capability synth
// =====================================================================

export interface CapabilitySynthOptions {
  uploads: UploadedDocument[];
  bundle: LeaseExtractionBundle;
  onProgress?: (msg: string) => void;
}

export interface CapabilitySynthResult {
  makeGoodCostBand?: MakeGoodCostBand;
  marketReviewProjections: MarketReviewProjection[];
  notificationObligations: LandlordNotificationObligation[];
  optionAnalysis: OptionExerciseAnalysis[];
  planning?: PlanningCompliance;
  livVersion?: LivVersionAnalysis;
  commentaryRisks: CommentaryRiskFinding[];
  leaseChain?: LeaseChainAnalysis;
}

export async function synthesiseCapabilities(
  opts: CapabilitySynthOptions,
): Promise<CapabilitySynthResult> {
  const { uploads, bundle, onProgress } = opts;

  // Cheap deterministic computations first
  const makeGoodCostBand = computeMakeGoodCostBand(bundle);
  const marketReviewProjections = computeMarketReviewProjections(bundle);
  const notificationObligations = computeNotificationObligations(bundle);
  const planning = await computePlanningCompliance(bundle);
  const leaseChain = analyseLeaseChain(uploads);

  onProgress?.(
    `Synthesis: ${marketReviewProjections.length} market projections · ${notificationObligations.length} notifications · ${makeGoodCostBand ? "make-good cost band" : "no make-good"}${leaseChain ? ` · chain ${leaseChain.documents.length} docs` : ""}`,
  );

  // LLM-driven capabilities — run in parallel
  onProgress?.("Calling Claude: option analysis + LIV detection + commentary…");
  const [optionAnalysis, livVersion, commentaryRisks] = await Promise.all([
    computeOptionAnalyses(bundle).catch(() => [] as OptionExerciseAnalysis[]),
    detectLivVersion(uploads).catch(() => undefined),
    findCommentaryRisks(bundle).catch(() => [] as CommentaryRiskFinding[]),
  ]);

  return {
    makeGoodCostBand,
    marketReviewProjections,
    notificationObligations,
    optionAnalysis,
    planning,
    livVersion,
    commentaryRisks,
    leaseChain,
  };
}
