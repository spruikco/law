import type Anthropic from "@anthropic-ai/sdk";
import { WillFindingSchema, type WillExtraction, type WillFinding } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record the will validity finding for this rule. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail", "warning", "needs_review"] },
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
      category: {
        type: "string",
        enum: [
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
        ],
      },
      title: { type: "string" },
      explanation: { type: "string" },
      remediation: { type: "string" },
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
    required: ["status", "severity", "category", "title", "explanation"],
  },
};

const CATEGORY_BY_RULE: Record<string, WillFinding["category"]> = {
  "wills-s7-execution-formalities": "execution",
  "wills-s8a-knowledge-and-approval": "knowledge_and_approval",
  "wills-s5-testamentary-capacity": "capacity",
  "wills-s13-interested-witness": "interested_witness",
  "wills-s9-informal-execution": "informal_s9",
  "wills-residue-clause": "residue",
  "wills-executor-appointment": "executor",
  "wills-beneficiary-clarity": "beneficiary_clarity",
  "wills-revocation-clause": "revocation",
  "wills-binding-death-benefit": "tax_super",
  "wills-mutual-wills": "mutual_wills",
  "wills-international-element": "other",
};

async function checkRule(rule: Rule, extraction: WillExtraction): Promise<WillFinding> {
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      `${rule.description} ${rule.citation.act} s ${rule.citation.section}`,
      { limit: 3 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant statutory excerpts:\n" +
        chunks.map((c) => `[${c.act} s ${c.section}]\n${c.text}`).join("\n\n");
    }
  } catch {
    /* corpus not ready */
  }

  const prompt = `You are checking ONE will validity rule.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Extracted will (JSON):
${JSON.stringify(extraction, null, 2)}
${retrievedBlock}

Decide pass / fail / warning / needs_review and call record_finding.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1200,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_finding" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`wills pass3: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as {
    status: WillFinding["status"];
    severity: WillFinding["severity"];
    category?: WillFinding["category"];
    title: string;
    explanation: string;
    remediation?: string;
    citations?: WillFinding["citations"];
  };

  return WillFindingSchema.parse({
    ruleId: rule.id,
    status: input.status,
    severity: input.severity,
    category: input.category ?? CATEGORY_BY_RULE[rule.id] ?? "other",
    title: input.title ?? rule.description,
    explanation: input.explanation ?? input.title ?? rule.description,
    remediation: input.remediation,
    citations: input.citations ?? [
      { act: rule.citation.act, section: rule.citation.section, url: rule.citation.url },
    ],
  });
}

export interface CheckWillsValidityOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkWillsValidity(
  extraction: WillExtraction,
  opts: CheckWillsValidityOptions = {},
): Promise<WillFinding[]> {
  const rules = await loadRules("wills-validity.yaml");
  const out: WillFinding[] = [];
  const CONCURRENCY = 5;
  let done = 0;
  for (let i = 0; i < rules.length; i += CONCURRENCY) {
    const batch = rules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const f = await checkRule(r, extraction);
        done += 1;
        opts.onRuleChecked?.(done, rules.length, r.id);
        return f;
      }),
    );
    out.push(...checked);
  }
  return out;
}
