import type Anthropic from "@anthropic-ai/sdk";
import {
  ComplianceFindingSchema,
  type ComplianceFinding,
  type LeaseExtractionBundle,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { withRetry } from "../anthropic/retry";
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

/**
 * Shared system prompt for every rule check in this review — the extraction
 * bundle is identical across rule calls, so cache it (see pass3-compliance
 * in the property pipeline for the same pattern).
 */
function buildSystem(bundle: LeaseExtractionBundle): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: `You are checking compliance rules, one per request, against extracted data from a Victorian commercial lease.

Extracted data (JSON):
${JSON.stringify(bundle, null, 2)}

For the rule given in the user message, decide: pass / fail / warning / needs_review.
- pass: requirement is clearly met
- fail: requirement is clearly NOT met
- warning: requirement is marginal — lawyer should look
- needs_review: insufficient data

Call record_finding with status, severity, title, explanation, citations, sourceRefs.`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

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

  const prompt = `Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  severity (default if fail): ${rule.severity}

Checker instructions:
${rule.checkerPrompt}
${retrievedBlock}`;

  const input = await withRetry(
    async () => {
      const res = await anthropic.messages.create({
        model: Models.Sonnet,
        max_tokens: 1024,
        system: buildSystem(bundle),
        tools: [CHECK_TOOL],
        tool_choice: { type: "tool", name: "record_finding" },
        messages: [{ role: "user", content: prompt }],
      });
      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error(`lease pass3: tool not called for rule '${rule.id}'`);
      }
      return toolUse.input as Omit<ComplianceFinding, "ruleId" | "citations"> & {
        citations?: ComplianceFinding["citations"];
      };
    },
    { label: `lease pass3 rule ${rule.id}` },
  );

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

  // First rule runs alone to write the shared prompt-cache prefix before
  // the concurrent batches read it.
  const results: ComplianceFinding[] = [];
  const CONCURRENCY = 5;
  const total = allRules.length;
  let done = 0;
  if (allRules.length > 1) {
    const first = allRules.shift()!;
    results.push(await checkRule(first, bundle));
    done += 1;
    opts.onRuleChecked?.(done, total, first.id);
  }
  for (let i = 0; i < allRules.length; i += CONCURRENCY) {
    const batch = allRules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const finding = await checkRule(r, bundle);
        done += 1;
        opts.onRuleChecked?.(done, total, r.id);
        return finding;
      }),
    );
    results.push(...checked);
  }
  return results;
}
