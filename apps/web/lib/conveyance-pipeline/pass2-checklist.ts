import type Anthropic from "@anthropic-ai/sdk";
import {
  ConveyanceFindingSchema,
  type ConveyanceFinding,
  type SettlementCalculation,
  type SettlementInput,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record one VIC conveyance settlement compliance finding. Call exactly once.",
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
  input: SettlementInput,
  calc: SettlementCalculation,
): Promise<ConveyanceFinding> {
  const prompt = `You are checking ONE VIC conveyance settlement compliance rule.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Settlement input (JSON):
${JSON.stringify(input, null, 2)}

Calculation results (JSON):
${JSON.stringify(calc, null, 2)}

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
    throw new Error(`conveyance pass2: tool not called for rule '${rule.id}'`);
  }
  const t = toolUse.input as Omit<ConveyanceFinding, "ruleId" | "citations">;

  return ConveyanceFindingSchema.parse({
    ruleId: rule.id,
    status: t.status,
    severity: t.severity,
    title: t.title,
    explanation: t.explanation,
    remediation: t.remediation,
    citations: [{ act: rule.citation.act, section: rule.citation.section, url: rule.citation.url }],
  });
}

export interface CheckConveyanceOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkConveyanceCompliance(
  input: SettlementInput,
  calc: SettlementCalculation,
  opts: CheckConveyanceOptions = {},
): Promise<ConveyanceFinding[]> {
  const rules = await loadRules("conveyance-settlement.yaml");
  const out: ConveyanceFinding[] = [];
  const CONCURRENCY = 4;
  let done = 0;
  for (let i = 0; i < rules.length; i += CONCURRENCY) {
    const batch = rules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const f = await checkRule(r, input, calc);
        done += 1;
        opts.onRuleChecked?.(done, rules.length, r.id);
        return f;
      }),
    );
    out.push(...checked);
  }
  return out;
}
