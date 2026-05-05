import type Anthropic from "@anthropic-ai/sdk";
import {
  TrustComplianceFindingSchema,
  type TrustAccountInput,
  type TrustComplianceFinding,
  type TrustReconciliation,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record one trust accounting compliance finding. Call exactly once.",
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
  input: TrustAccountInput,
  reconciliation: TrustReconciliation,
): Promise<TrustComplianceFinding> {
  // To keep prompts compact, omit ledgerBalances entries that aren't overdrawn.
  const reconForPrompt = {
    ...reconciliation,
    ledgerBalances: reconciliation.ledgerBalances.slice(0, 50),
  };
  const prompt = `You are checking ONE trust accounting compliance rule (LPUL Pt 4.2 + LPUGR).

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Trust input (JSON):
${JSON.stringify(input, null, 2)}

Reconciliation results (JSON):
${JSON.stringify(reconForPrompt, null, 2)}

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
    throw new Error(`trust-accounting pass2: tool not called for rule '${rule.id}'`);
  }
  const t = toolUse.input as Omit<TrustComplianceFinding, "ruleId" | "citations">;

  return TrustComplianceFindingSchema.parse({
    ruleId: rule.id,
    status: t.status,
    severity: t.severity,
    title: t.title,
    explanation: t.explanation,
    remediation: t.remediation,
    citations: [{ act: rule.citation.act, section: rule.citation.section, url: rule.citation.url }],
  });
}

export interface CheckTrustOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkTrustCompliance(
  input: TrustAccountInput,
  reconciliation: TrustReconciliation,
  opts: CheckTrustOptions = {},
): Promise<TrustComplianceFinding[]> {
  const rules = await loadRules("trust-accounting-lpul-pt42.yaml");
  const out: TrustComplianceFinding[] = [];
  const CONCURRENCY = 4;
  let done = 0;
  for (let i = 0; i < rules.length; i += CONCURRENCY) {
    const batch = rules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const f = await checkRule(r, input, reconciliation);
        done += 1;
        opts.onRuleChecked?.(done, rules.length, r.id);
        return f;
      }),
    );
    out.push(...checked);
  }
  return out;
}
