import type Anthropic from "@anthropic-ai/sdk";
import {
  BankDocProvisionSchema,
  type BankDocProvision,
  type BankDocClassification,
  type FacilityParticulars,
  type GuaranteeAssessment,
  type DefaultAndEnforcement,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import { loadRules } from "../rules/loader";
import type { UploadedDocument } from "./types";

const ANALYSE_TOOL: Anthropic.Tool = {
  name: "record_provisions",
  description:
    "Record clause-by-clause analysis of borrower / guarantor adverse provisions. Call exactly once with all provisions in a single array.",
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
                "borrower_adverse",
                "guarantor_adverse",
                "lender_favoured",
                "unusual",
                "ncc_conflict",
                "acl_uct_candidate",
              ],
            },
            focusArea: {
              type: "string",
              enum: [
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
              ],
            },
            severity: {
              type: "string",
              enum: ["info", "low", "medium", "high", "critical"],
            },
            borrowerImpact: { type: "string" },
            proposedAmendment: { type: "string" },
            amendmentRationale: { type: "string" },
            uctCandidate: { type: "boolean" },
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
            "borrowerImpact",
          ],
        },
      },
    },
    required: ["provisions"],
  },
};

export interface AnalyseClausesContext {
  classification: BankDocClassification;
  particulars: FacilityParticulars;
  guarantee: GuaranteeAssessment;
  defaultAndEnforcement: DefaultAndEnforcement;
}

export async function analyseBankProvisions(
  uploads: UploadedDocument[],
  ctx: AnalyseClausesContext,
): Promise<BankDocProvision[]> {
  const patterns = await loadRules("bank-docs-borrower-adverse.yaml");

  const patternList = patterns
    .map(
      (p) =>
        `- [${p.severity}] ${p.id} — ${p.description}\n    Citation: ${p.citation.act} s ${p.citation.section}\n    Match guidance: ${p.checkerPrompt.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");

  const prompt = `You are clause-checking the uploaded bank documents against a catalogue of borrower-/guarantor-adverse patterns. The documents you have are: mortgage / loan agreement / letter of offer / guarantee / GSA — review every operative clause.

Classification: ${ctx.classification.kind} · Consumer credit: ${ctx.classification.isConsumerCredit} · ACL UCT regime: ${ctx.classification.isUnfairContractTermsRegime} · Third-party guarantee: ${ctx.classification.isThirdPartyGuarantee}

Pattern catalogue:
${patternList}

Instructions:
- Iterate every operative clause. For each, decide whether it matches one or more patterns above.
- Classify each as: standard / borrower_adverse / guarantor_adverse / lender_favoured / unusual / ncc_conflict / acl_uct_candidate.
- For non-standard clauses, propose a polite-but-firm amendment. Tone: professional Australian banking-and-finance lawyer to bank's lawyer, never aggressive, never meek. Cite the citation from the matched pattern (or the most relevant statute) inline.
- For each clause, set uctCandidate=true if it is a strong candidate for ACL Pt 2-3 challenge (large imbalance, not reasonably necessary, would cause detriment) — only relevant where classification.isUnfairContractTermsRegime is true.
- Quote 'fullText' VERBATIM.
- Skip true boilerplate (definitions, governing-law, severability) unless it has a substantive bite (e.g. a "severability + replacement clause" that lets the lender rewrite invalid terms).

Existing extracted context:
${JSON.stringify({ particulars: ctx.particulars, guarantee: ctx.guarantee, defaultAndEnforcement: ctx.defaultAndEnforcement }, null, 2)}

Call record_provisions exactly once with the full array.`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Opus,
    max_tokens: 32000,
    tools: [ANALYSE_TOOL],
    tool_choice: { type: "tool", name: "record_provisions" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("bank-docs pass4: model did not call record_provisions");
  }
  const input = toolUse.input as { provisions: unknown[] };
  return (input.provisions ?? []).map((p) =>
    BankDocProvisionSchema.parse({
      ...(p as Record<string, unknown>),
      citations: ((p as Record<string, unknown>).citations as unknown[] | undefined) ?? [],
      uctCandidate: ((p as Record<string, unknown>).uctCandidate as boolean | undefined) ?? false,
    }),
  );
}
