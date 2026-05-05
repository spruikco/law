import type Anthropic from "@anthropic-ai/sdk";
import {
  RiskFindingSchema,
  type ExtractionBundle,
  type RiskFinding,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";
import { loadRules } from "../rules/loader";

const RISK_TOOL: Anthropic.Tool = {
  name: "record_risks",
  description: "Record every risk finding for this contract. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable unique id, e.g. 'risk-01'" },
            kind: {
              type: "string",
              enum: [
                "condition_precedent",
                "risky_special_condition",
                "general_condition_variation",
                "tax_implication",
                "title_issue",
                "other",
              ],
            },
            severity: {
              type: "string",
              enum: ["info", "low", "medium", "high", "critical"],
            },
            title: { type: "string" },
            explanation: { type: "string" },
            netEffect: {
              type: "string",
              description:
                "For general-condition variations: plain-English net effect of the variation",
            },
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
            specialConditionNumber: { type: "string" },
            generalConditionNumber: { type: "string" },
          },
          required: ["id", "kind", "severity", "title", "explanation"],
        },
      },
    },
    required: ["findings"],
  },
};

export async function analyseRisk(
  extraction: ExtractionBundle,
): Promise<RiskFinding[]> {
  // Load the risky-special-conditions patterns as context for Opus
  const riskPatterns = await loadRules("risky-special-conditions.yaml");
  const patternsSummary = riskPatterns
    .map(
      (r) =>
        `- ${r.id} (${r.severity}): ${r.description}\n  cite: ${r.citation.act} s ${r.citation.section}`,
    )
    .join("\n");

  // RAG: pull general property law + SoLA general context for grounding
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      "special conditions variation general conditions time of essence deposit finance",
      { limit: 6 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant legislation & general-condition excerpts:\n" +
        chunks
          .map(
            (c) =>
              `[${c.act} s ${c.section}${c.subsection ? " " + c.subsection : ""}]\n${c.text}`,
          )
          .join("\n\n");
    }
  } catch {
    // Corpus not yet ingested — proceed ungrounded
  }

  const prompt = `You are assisting a Victorian property lawyer. Analyse the following extracted contract data and produce a RISK REPORT for the lawyer to review.

Your tasks, in order:

1. Identify every CONDITION PRECEDENT (finance approval, building inspection, pest inspection, due diligence, etc.) — one finding per condition, with exact terms from the special condition.

2. Classify each SPECIAL CONDITION as standard / risky / highly-risky. Surface every risky or highly-risky one as a 'risky_special_condition' finding. Reference the pattern catalogue below — but add anything risky you spot that isn't listed.

3. Detect every SPECIAL CONDITION THAT VARIES A GENERAL CONDITION. Produce a 'general_condition_variation' finding with netEffect: the plain-English net effect on the purchaser.

4. Surface TAX IMPLICATIONS — land tax, windfall gains tax, commercial & industrial property tax reform, GST, foreign purchaser additional duty — if any trigger appears in the data.

5. Surface TITLE ISSUES — unusual encumbrances, caveats, easements that affect use.

Rules:
- Be SPECIFIC. Quote clause numbers, amounts, and parties.
- Be CONCRETE. "Risky" alone is not a finding — say WHY.
- Cite the legislative basis where you can. Use the retrieved excerpts where relevant.
- Severity:
  - critical: contract-level deal-breaker (e.g. no finance condition; deposit release without s27 compliance)
  - high: likely material adverse impact on purchaser
  - medium: material but manageable
  - low: minor
  - info: noteworthy context

Pattern catalogue (risky SCs):
${patternsSummary}

Extracted data (JSON):
${JSON.stringify(extraction, null, 2)}
${retrievedBlock}

Call record_risks exactly once with EVERY finding.`;

  const res = await anthropic.messages.create({
    model: Models.Opus,
    max_tokens: 8000,
    tools: [RISK_TOOL],
    tool_choice: { type: "tool", name: "record_risks" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("pass4-risk: model did not call record_risks");
  }
  const input = toolUse.input as { findings: RiskFinding[] };
  return input.findings.map((f) =>
    RiskFindingSchema.parse({
      ...f,
      citations: f.citations ?? [],
    }),
  );
}
