import type Anthropic from "@anthropic-ai/sdk";
import {
  AdditionalProvisionSchema,
  type AdditionalProvision,
  type LeaseClassification,
  type LeaseItems,
  type MakeGoodAssessment,
  type OutgoingsAssessment,
  type OngoingFinancialObligations,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import { retrieve } from "../rag";
import { loadRules } from "../rules/loader";
import type { UploadedDocument } from "./types";

const CLAUSES_TOOL: Anthropic.Tool = {
  name: "record_additional_provisions",
  description:
    "Record EVERY Additional Provision / special clause in the lease (typically a schedule at the back of the LIV form), with classification and — where not standard — a polite-but-firm proposed amendment. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      provisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "string" },
            heading: { type: "string" },
            fullText: { type: "string" },
            summary: { type: "string" },
            classification: {
              type: "string",
              enum: [
                "standard",
                "tenant_adverse",
                "landlord_favoured",
                "unusual",
                "rla_conflict",
              ],
            },
            focusArea: {
              type: "string",
              enum: [
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
              ],
            },
            severity: {
              type: "string",
              enum: ["info", "low", "medium", "high", "critical"],
            },
            tenantImpact: { type: "string" },
            proposedAmendment: { type: "string" },
            amendmentRationale: { type: "string" },
            rlaConflict: { type: "boolean" },
            citations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  act: { type: "string" },
                  section: { type: "string" },
                  url: { type: "string" },
                  quotedText: { type: "string" },
                },
                required: ["act", "section"],
              },
            },
          },
          required: [
            "number",
            "fullText",
            "summary",
            "classification",
            "focusArea",
            "severity",
            "tenantImpact",
          ],
        },
      },
    },
    required: ["provisions"],
  },
};

export interface ClauseAnalysisContext {
  classification: LeaseClassification;
  items: LeaseItems;
  makeGood: MakeGoodAssessment;
  outgoings: OutgoingsAssessment;
  ongoingObligations: OngoingFinancialObligations;
}

export async function analyseAdditionalProvisions(
  uploads: UploadedDocument[],
  ctx: ClauseAnalysisContext,
): Promise<AdditionalProvision[]> {
  // Pull tenant-adverse pattern catalogue + RLA context
  const [adversePatterns, financialPatterns] = await Promise.all([
    loadRules("lease-tenant-adverse-patterns.yaml").catch(() => []),
    loadRules("lease-financial-obligations.yaml").catch(() => []),
  ]);

  const patternsSummary = [...adversePatterns, ...financialPatterns]
    .map(
      (r) =>
        `- ${r.id} (${r.severity}): ${r.description}\n  cite: ${r.citation.act} s ${r.citation.section}`,
    )
    .join("\n");

  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      "retail leases outgoings make good rent review assignment relocation demolition s46 s51",
      { limit: 6 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant legislation excerpts:\n" +
        chunks
          .map(
            (c) =>
              `[${c.act} s ${c.section}${c.subsection ? " " + c.subsection : ""}]\n${c.text}`,
          )
          .join("\n\n");
    }
  } catch {
    // corpus not ready
  }

  const prompt = `You are assisting a Victorian property lawyer reviewing a commercial lease for a TENANT client. The baseline is the LIV 2023 standard-form commercial lease.

Analyse EVERY Additional Provision / non-standard clause in the lease (typically in a schedule at the back of the LIV form, or marked "Additional Provisions" / "Special Conditions"). For each one, classify and — where it departs from standard or is unfavourable to the tenant — propose a polite-but-firm amendment that a tenant's solicitor could send back in a markup.

Top three focus areas (weight severity accordingly):
1. Ongoing financial obligations on the tenant (especially those continuing AFTER expiry)
2. Excessive make-good obligations (moderate+ — especially bare-shell reinstatement)
3. Excessive annual outgoings (items beyond standard LIV 2023 outgoings; no cap on year-on-year increases)

Classification:
- standard: matches LIV 2023 template, or a routine commercial drafting with no tenant-adverse impact
- tenant_adverse: measurably worse for tenant than LIV 2023 baseline
- landlord_favoured: drafted to protect landlord beyond what is typical, without clear tenant detriment
- unusual: non-standard drafting of unclear effect
- rla_conflict: purports to contract out of, or override, a mandatory RLA 2003 provision (${ctx.classification.rlaApplies ? "RLA APPLIES — this lease is retail" : "RLA does not apply — tenant is on PLA/common-law footing"})

Proposed amendment tone: **polite but firm**. Examples:
- YES: "We request this clause be amended so that the tenant's obligation to indemnify the landlord is capped at direct losses and does not extend to consequential loss."
- YES: "Please amend to cap annual outgoings increases at CPI."
- NO (too aggressive): "Tenant requires deletion of this clause."
- NO (too meek): "Maybe consider if this clause could perhaps be softened."

For each provision you MUST include:
- number, heading (if any), fullText (verbatim — do not paraphrase), summary
- classification, focusArea, severity
- tenantImpact (plain English — 1-3 sentences)
- proposedAmendment (omit only if classification === "standard")
- amendmentRationale (one-sentence reason the tenant can use in negotiation)
- rlaConflict (true iff it purports to contract out of a mandatory RLA provision)
- citations (if the amendment is grounded in legislation, cite the section)

Pattern catalogue (tenant-adverse patterns + financial obligation triggers):
${patternsSummary}

Context — extraction results from earlier pass:
- Classification: ${ctx.classification.kind} (rlaApplies=${ctx.classification.rlaApplies}) — ${ctx.classification.reasoning}
- Premises: ${ctx.items.premisesAddress}
- Permitted use: ${ctx.items.permittedUse}
- Term: ${ctx.items.termDescription}
- Rent review: ${ctx.items.rentReview?.description ?? "not captured"} (ratchet=${ctx.items.rentReview?.ratchetPresent ?? false})
- Outgoings payable: ${ctx.outgoings.payable}, cap present: ${ctx.outgoings.capPresent}
- Make-good: ${ctx.makeGood.severityRating ?? "not captured"} — ${ctx.makeGood.quotedText ?? ""}
- Ongoing obligations already flagged: ${ctx.ongoingObligations.items.length}
${retrievedBlock}

Call record_additional_provisions once with every provision in the lease.`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Opus,
    max_tokens: 16000,
    tools: [CLAUSES_TOOL],
    tool_choice: { type: "tool", name: "record_additional_provisions" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("lease pass4: model did not call record_additional_provisions");
  }
  const input = toolUse.input as { provisions: AdditionalProvision[] };
  return input.provisions.map((p) =>
    AdditionalProvisionSchema.parse({
      ...p,
      rlaConflict: p.rlaConflict ?? false,
      citations: p.citations ?? [],
    }),
  );
}
