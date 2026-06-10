import type Anthropic from "@anthropic-ai/sdk";
import {
  UnenforceabilityFindingSchema,
  type UnenforceabilityFinding,
  type LeaseExtractionBundle,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { withRetry } from "../anthropic/retry";
import { retrieve } from "../rag";
import {
  loadUnenforceabilityRules,
  type UnenforceabilityRule,
} from "../rules/loader";

/**
 * PRJ-693 capability 5 — landlord non-compliance → unenforceability.
 *
 * Per-rule LLM evaluation: feed extraction + RAG'd legislation + the rule's
 * detect/remedy instructions, ask Claude to either emit a finding (with $ exposure
 * estimate, affected clauses, evidence quotes) or skip the rule. Output:
 * UnenforceabilityFinding[] keyed by rule id.
 *
 * Pipeline pass: 3b. Runs after 3a mandatory protections, retail leases only.
 */

const FINDING_TOOL: Anthropic.Tool = {
  name: "record_unenforceability_finding",
  description:
    "Record an UnenforceabilityFinding for this rule when the rule MATCHES. If the rule does NOT match, call skip_rule instead.",
  input_schema: {
    type: "object",
    properties: {
      detectionSignals: { type: "array", items: { type: "string" } },
      affectedClauses: {
        type: "array",
        items: { type: "string" },
        description: "Lease clause numbers / refs rendered void or unenforceable.",
      },
      estimatedExposureAud: {
        type: "number",
        description:
          "Best-effort dollar exposure to the tenant (recoverable / withholdable). Omit if unquantifiable.",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "Verbatim quotes from the lease that triggered the finding.",
      },
      remedyForTenant: {
        type: "string",
        description:
          "Plain-English next step. Default to the rule's remedyTemplate, customise where the facts warrant.",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      needsLawyerConfirm: { type: "boolean" },
      // status: "match" — implicit by calling this tool
    },
    required: ["detectionSignals", "evidence", "remedyForTenant", "confidence"],
  },
};

const SKIP_TOOL: Anthropic.Tool = {
  name: "skip_rule",
  description:
    "Call when the rule does NOT match the lease (no breach detected). Provide a one-sentence reason.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string" },
    },
    required: ["reason"],
  },
};

const NEEDS_REVIEW_TOOL: Anthropic.Tool = {
  name: "needs_review",
  description:
    "Call when the rule's detection requires a fact not in the extraction (e.g. 'was disclosure given on time?'). Phase 2 rules will commonly use this.",
  input_schema: {
    type: "object",
    properties: {
      questionForTenant: {
        type: "string",
        description: "The question the tenant client must answer to resolve this rule.",
      },
    },
    required: ["questionForTenant"],
  },
};

/**
 * Shared system prompt for every unenforceability rule check — the
 * extraction bundle and decision tree are identical across rule calls, so
 * cache them (same pattern as pass3-rla-compliance).
 */
function buildSystem(bundle: LeaseExtractionBundle): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: `You are evaluating unenforceability rules, one per request, against the extracted data from a Victorian retail lease, on behalf of the TENANT.

The objective is to identify breaches by the landlord of the Retail Leases Act 2003 (Vic) that render specific lease provisions VOID or remove the tenant's liability to pay until the landlord remedies. This is the highest-value capability of the system — be precise, cite evidence verbatim, and do NOT invent matches.

Extracted data (JSON — examine all of it, especially additionalProvisions, items.outgoingsDescription, outgoings.items, outgoings.excessiveItems, items.rentReview):
${JSON.stringify(bundle, null, 2)}

Decision tree:
1. If the lease CLEARLY MATCHES the rule (a clause exists or is missing in a way that triggers the failure), call record_unenforceability_finding with:
   - detectionSignals: which fact(s) in the extraction matched
   - affectedClauses: clause numbers rendered void / unenforceable (e.g. "AP12", "items.outgoingsDescription")
   - estimatedExposureAud: dollar exposure to the tenant if knowable; omit if not
   - evidence: short verbatim quotes
   - remedyForTenant: customise the template if the facts warrant; otherwise use it as-is
   - confidence: 0..1 (≥0.7 for clear matches, 0.4-0.7 for likely, <0.4 don't emit — call skip)
   - needsLawyerConfirm: true if the legal effect is interpretive
2. If the rule clearly DOES NOT match, call skip_rule with a one-sentence reason.
3. If the rule requires a fact not in the extraction (typical for phase 2 rules), call needs_review with the question to ask the tenant.

Call exactly ONE of: record_unenforceability_finding, skip_rule, needs_review.`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

async function checkUnenforceabilityRule(
  rule: UnenforceabilityRule,
  bundle: LeaseExtractionBundle,
): Promise<UnenforceabilityFinding | null> {
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      `${rule.landlordFailure} ${rule.trigger.act} s ${rule.trigger.section}`,
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
  trigger: ${rule.trigger.act} s ${rule.trigger.section}
  effect if matched: ${rule.effect}
  severity if matched: ${rule.severity}
  phase: ${rule.phase} ${rule.phase === 2 ? "(may need a fact not in the extraction — use needs_review tool if so)" : ""}

Landlord failure pattern:
${rule.landlordFailure}

Detection instructions:
${rule.detectInstructions}

Default remedy template (customise where the facts warrant):
${rule.remedyTemplate}
${retrievedBlock}`;

  const toolUse = await withRetry(
    async () => {
      const res = await anthropic.messages.create({
        model: Models.Sonnet,
        max_tokens: 2048,
        system: buildSystem(bundle),
        tools: [FINDING_TOOL, SKIP_TOOL, NEEDS_REVIEW_TOOL],
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: prompt }],
      });
      const tu = res.content.find((b) => b.type === "tool_use");
      if (!tu || tu.type !== "tool_use") {
        throw new Error(`pass3b: model did not call any tool for '${rule.id}'`);
      }
      return tu;
    },
    { label: `lease pass3b rule ${rule.id}` },
  );

  if (toolUse.name === "skip_rule") return null;

  if (toolUse.name === "needs_review") {
    const input = toolUse.input as { questionForTenant: string };
    return UnenforceabilityFindingSchema.parse({
      ruleId: rule.id,
      trigger: rule.trigger,
      landlordFailure: rule.landlordFailure,
      detectionSignals: [`Phase ${rule.phase} — fact not in extraction`],
      affectedClauses: [],
      effect: rule.effect,
      estimatedExposureAud: null,
      evidence: [],
      remedyForTenant: `Question for the tenant: ${input.questionForTenant}\n\nIf the answer indicates breach: ${rule.remedyTemplate}`,
      citations: [
        { act: rule.trigger.act, section: rule.trigger.section, url: rule.trigger.url },
      ],
      severity: rule.severity,
      confidence: 0.5,
      needsLawyerConfirm: true,
    });
  }

  // record_unenforceability_finding
  const input = toolUse.input as {
    detectionSignals: string[];
    affectedClauses?: string[];
    estimatedExposureAud?: number;
    evidence: string[];
    remedyForTenant: string;
    confidence: number;
    needsLawyerConfirm?: boolean;
  };

  if (input.confidence < 0.4) return null; // suppress per spec

  return UnenforceabilityFindingSchema.parse({
    ruleId: rule.id,
    trigger: rule.trigger,
    landlordFailure: rule.landlordFailure,
    detectionSignals: input.detectionSignals,
    affectedClauses: input.affectedClauses ?? [],
    effect: rule.effect,
    estimatedExposureAud:
      typeof input.estimatedExposureAud === "number"
        ? input.estimatedExposureAud
        : null,
    evidence: input.evidence,
    remedyForTenant: input.remedyForTenant,
    citations: [
      {
        act: rule.trigger.act,
        section: rule.trigger.section,
        url: rule.trigger.url,
      },
    ],
    severity: rule.severity,
    confidence: input.confidence,
    needsLawyerConfirm: input.needsLawyerConfirm ?? rule.needsLawyerConfirm,
  });
}

export interface CheckUnenforceabilityOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkRlaUnenforceability(
  bundle: LeaseExtractionBundle,
  opts: CheckUnenforceabilityOptions = {},
): Promise<UnenforceabilityFinding[]> {
  if (!bundle.classification.rlaApplies) return [];

  const rules = await loadUnenforceabilityRules(
    "lease-rla-unenforceability.yaml",
  );

  const findings: UnenforceabilityFinding[] = [];
  const CONCURRENCY = 5;
  // First rule runs alone to write the shared prompt-cache prefix before
  // the concurrent batches read it.
  const total = rules.length;
  let done = 0;
  if (rules.length > 1) {
    const first = rules.shift()!;
    const finding = await checkUnenforceabilityRule(first, bundle);
    if (finding) findings.push(finding);
    done += 1;
    opts.onRuleChecked?.(done, total, first.id);
  }
  for (let i = 0; i < rules.length; i += CONCURRENCY) {
    const batch = rules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const finding = await checkUnenforceabilityRule(r, bundle);
        done += 1;
        opts.onRuleChecked?.(done, total, r.id);
        return finding;
      }),
    );
    for (const f of checked) if (f) findings.push(f);
  }

  // Sort: critical/high first, then by confidence descending
  const sevRank = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as const;
  findings.sort((a, b) => {
    const s = sevRank[b.severity] - sevRank[a.severity];
    return s !== 0 ? s : b.confidence - a.confidence;
  });
  return findings;
}
