import type Anthropic from "@anthropic-ai/sdk";
import {
  ComplianceFindingSchema,
  type ComplianceFinding,
  type LeaseExtractionBundle,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record the RLA compliance finding for this rule. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pass", "fail", "warning", "needs_review"],
      },
      severity: {
        type: "string",
        enum: ["info", "low", "medium", "high", "critical"],
      },
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
      sourceRefs: { type: "array", items: { type: "string" } },
    },
    required: ["status", "severity", "title", "explanation"],
  },
};

async function checkRule(
  rule: Rule,
  bundle: LeaseExtractionBundle,
): Promise<ComplianceFinding> {
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      `${rule.description} ${rule.citation.act} s ${rule.citation.section}`,
      { limit: 4 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant RLA / Property Law Act excerpts (use for citations):\n" +
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

  const prompt = `You are checking ONE compliance rule against extracted data from a Victorian commercial lease.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  severity (default if fail): ${rule.severity}

Checker instructions:
${rule.checkerPrompt}

Extracted data (JSON):
${JSON.stringify(bundle, null, 2)}
${retrievedBlock}

Decide: pass / fail / warning / needs_review.
- pass: requirement is clearly met
- fail: requirement is clearly NOT met
- warning: requirement is marginal — lawyer should look
- needs_review: insufficient data

Call record_finding with status, severity, title, explanation, citations, sourceRefs.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1024,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_finding" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`lease pass3: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as Omit<ComplianceFinding, "ruleId" | "citations"> & {
    citations?: ComplianceFinding["citations"];
  };

  return ComplianceFindingSchema.parse({
    ruleId: rule.id,
    status: input.status,
    severity: input.severity,
    title: input.title ?? rule.description,
    explanation: input.explanation ?? input.title ?? rule.description,
    citations: input.citations ?? [
      { act: rule.citation.act, section: rule.citation.section, url: rule.citation.url },
    ],
    sourceRefs: input.sourceRefs ?? [],
  });
}

const RULE_FILES = ["lease-rla-mandatory.yaml"];

export interface CheckRlaOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkRlaCompliance(
  bundle: LeaseExtractionBundle,
  opts: CheckRlaOptions = {},
): Promise<ComplianceFinding[]> {
  // RLA only applies to retail leases
  if (!bundle.classification.rlaApplies) return [];

  const allRules: Rule[] = [];
  for (const f of RULE_FILES) {
    allRules.push(...(await loadRules(f)));
  }

  const results: ComplianceFinding[] = [];
  const CONCURRENCY = 5;
  let done = 0;
  for (let i = 0; i < allRules.length; i += CONCURRENCY) {
    const batch = allRules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const finding = await checkRule(r, bundle);
        done += 1;
        opts.onRuleChecked?.(done, allRules.length, r.id);
        return finding;
      }),
    );
    results.push(...checked);
  }
  return results;
}
