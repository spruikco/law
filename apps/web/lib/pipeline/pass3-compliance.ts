import type Anthropic from "@anthropic-ai/sdk";
import {
  ComplianceFindingSchema,
  type ComplianceFinding,
  type ExtractionBundle,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";
import { loadRules, type Rule } from "../rules/loader";

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_finding",
  description: "Record the compliance finding for this rule. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail", "warning", "needs_review"] },
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

function shouldApply(rule: Rule, bundle: ExtractionBundle): boolean {
  if (!rule.applies) return true;
  // Very simple condition interpreter — supports a handful of expressions
  // used in the seed rule files. Extend as needed.
  const oc = bundle.ownersCorp;
  const expr = rule.applies;
  if (expr.includes("ownersCorp.applies === true")) return oc.applies;
  if (expr.includes("ownersCorp.applies === false")) return !oc.applies;
  if (expr.includes("landTaxCert.commercialIndicators.length > 0")) {
    return (bundle.landTaxCert?.commercialIndicators?.length ?? 0) > 0;
  }
  // Unknown conditions: default to evaluating the rule so we don't silently skip.
  return true;
}

async function checkRule(
  rule: Rule,
  bundle: ExtractionBundle,
): Promise<ComplianceFinding> {
  // Retrieve relevant legislation chunks (best-effort — empty store is fine)
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      `${rule.description} ${rule.citation.act} s ${rule.citation.section}`,
      { limit: 4 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant legislation excerpts (use these for citations):\n" +
        chunks
          .map(
            (c) =>
              `[${c.act} s ${c.section}${c.subsection ? " " + c.subsection : ""}]\n${c.text}`,
          )
          .join("\n\n");
    }
  } catch {
    // RAG store not initialised yet — proceed without retrieval
  }

  const prompt = `You are checking ONE compliance rule against extracted data from a Victorian property contract + Section 32.

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
- fail: requirement is clearly NOT met (missing, inconsistent, or defective)
- warning: requirement is marginal — lawyer should look
- needs_review: insufficient data to tell

Then call record_finding with:
- status
- severity (raise above default if the issue is serious)
- title (short, lawyer-facing)
- explanation (2–4 sentences; reference exact data you saw)
- citations (at minimum, the rule's own citation; add retrieved-excerpt citations if used)
- sourceRefs (optional pointers back to extracted fields, e.g. 'particulars.price')`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1024,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_finding" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`pass3-compliance: tool not called for rule '${rule.id}'`);
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

const RULE_FILES = [
  "s32-mandatory-disclosures.yaml",
  "oc-red-flags.yaml",
  "tax-triggers.yaml",
];

export interface CheckComplianceOptions {
  /** Called once per rule as it finishes, for fine-grained UI progress. */
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkCompliance(
  extraction: ExtractionBundle,
  opts: CheckComplianceOptions = {},
): Promise<ComplianceFinding[]> {
  const allRules: Rule[] = [];
  for (const f of RULE_FILES) {
    allRules.push(...(await loadRules(f)));
  }
  const applicable = allRules.filter((r) => shouldApply(r, extraction));

  // Check rules in parallel — bounded concurrency via Promise.all chunks
  const results: ComplianceFinding[] = [];
  const CONCURRENCY = 5;
  let done = 0;
  for (let i = 0; i < applicable.length; i += CONCURRENCY) {
    const batch = applicable.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const finding = await checkRule(r, extraction);
        done += 1;
        opts.onRuleChecked?.(done, applicable.length, r.id);
        return finding;
      }),
    );
    results.push(...checked);
  }
  return results;
}
