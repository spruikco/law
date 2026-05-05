import type Anthropic from "@anthropic-ai/sdk";
import {
  CostDisclosureFindingSchema,
  type CostDisclosureFinding,
  type CostDisclosureInput,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record one cost-disclosure compliance finding. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail", "warning", "needs_review"] },
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
      title: { type: "string" },
      explanation: { type: "string" },
      remediation: { type: "string" },
    },
    required: ["status", "severity", "title", "explanation"],
  },
};

async function checkRule(
  rule: Rule,
  input: CostDisclosureInput,
): Promise<CostDisclosureFinding> {
  const prompt = `You are checking ONE LPUL s 174 cost-disclosure mandatory element.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Cost-disclosure input (JSON):
${JSON.stringify(input, null, 2)}

Decide pass / fail / warning / needs_review. Call record_finding.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1000,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_finding" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`cost-disclosure pass1: tool not called for rule '${rule.id}'`);
  }
  const t = toolUse.input as Omit<CostDisclosureFinding, "ruleId" | "citations">;

  return CostDisclosureFindingSchema.parse({
    ruleId: rule.id,
    status: t.status,
    severity: t.severity,
    title: t.title,
    explanation: t.explanation,
    remediation: t.remediation,
    citations: [{ act: rule.citation.act, section: rule.citation.section, url: rule.citation.url }],
  });
}

export interface CheckCostDisclosureOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkCostDisclosure(
  input: CostDisclosureInput,
  opts: CheckCostDisclosureOptions = {},
): Promise<CostDisclosureFinding[]> {
  const rules = await loadRules("cost-disclosure-s174-checklist.yaml");
  const out: CostDisclosureFinding[] = [];
  const CONCURRENCY = 5;
  let done = 0;
  for (let i = 0; i < rules.length; i += CONCURRENCY) {
    const batch = rules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const f = await checkRule(r, input);
        done += 1;
        opts.onRuleChecked?.(done, rules.length, r.id);
        return f;
      }),
    );
    out.push(...checked);
  }
  return out;
}
