import type Anthropic from "@anthropic-ai/sdk";
import {
  PoaComplianceFindingSchema,
  type PoaComplianceFinding,
  type PoaExtraction,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record the PoA validity finding for this rule. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail", "warning", "needs_review"] },
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
      title: { type: "string" },
      explanation: { type: "string" },
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
    required: ["status", "severity", "title", "explanation"],
  },
};

async function checkRule(rule: Rule, extraction: PoaExtraction): Promise<PoaComplianceFinding> {
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

  const prompt = `You are checking ONE PoA validity rule.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Extracted PoA bundle (JSON):
${JSON.stringify(extraction, null, 2)}
${retrievedBlock}

Decide pass / fail / warning / needs_review. Call record_finding.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1024,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_finding" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`poa pass3: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as Omit<PoaComplianceFinding, "ruleId" | "citations"> & {
    citations?: PoaComplianceFinding["citations"];
  };

  return PoaComplianceFindingSchema.parse({
    ruleId: rule.id,
    status: input.status,
    severity: input.severity,
    title: input.title ?? rule.description,
    explanation: input.explanation ?? input.title ?? rule.description,
    citations: input.citations ?? [
      { act: rule.citation.act, section: rule.citation.section, url: rule.citation.url },
    ],
  });
}

export interface CheckPoaValidityOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkPoaValidity(
  extraction: PoaExtraction,
  opts: CheckPoaValidityOptions = {},
): Promise<PoaComplianceFinding[]> {
  const rules = await loadRules("poa-validity.yaml");
  const out: PoaComplianceFinding[] = [];
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
