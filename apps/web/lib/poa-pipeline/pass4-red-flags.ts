import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import YAML from "yaml";
import { z } from "zod";
import {
  PoaRedFlagSchema,
  type Jurisdiction,
  type PoaExtraction,
  type PoaRedFlag,
} from "@law/schema";
import { repoRoot } from "../paths";
import { anthropic, Models } from "../anthropic/client";

const PoaRedFlagRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  citation: z.object({
    act: z.string(),
    section: z.string(),
    url: z.string().url().optional(),
  }),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  triggerSignals: z.array(z.string()).default([]),
  detectionPrompt: z.string(),
});
type PoaRedFlagRule = z.infer<typeof PoaRedFlagRuleSchema>;

const RuleFileSchema = z.object({
  title: z.string(),
  rules: z.array(PoaRedFlagRuleSchema),
});

const ROOT = path.join(repoRoot(), "rules");
function resolveRulePath(jurisdiction: Jurisdiction, filename: string): string {
  const j = jurisdiction.toLowerCase();
  const primary = path.join(ROOT, j, filename);
  if (existsSync(primary)) return primary;
  return path.join(ROOT, "vic", filename);
}

async function loadRedFlagRules(jurisdiction: Jurisdiction = "VIC"): Promise<PoaRedFlagRule[]> {
  const raw = await readFile(resolveRulePath(jurisdiction, "poa-red-flags.yaml"), "utf8");
  return RuleFileSchema.parse(YAML.parse(raw)).rules;
}

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_red_flag",
  description:
    "Record a PoA red-flag finding for this rule. Call exactly once. If the pattern does NOT apply, set applies=false with a brief reason.",
  input_schema: {
    type: "object",
    properties: {
      applies: { type: "boolean" },
      category: {
        type: "string",
        enum: [
          "capacity_doubt",
          "undue_influence",
          "conflict_of_interest",
          "self_dealing",
          "missing_acceptance",
          "witness_irregularity",
          "scope_overreach",
          "joint_appointment_deadlock",
          "elder_abuse_indicator",
          "other",
        ],
      },
      title: { type: "string" },
      explanation: { type: "string" },
      signals: { type: "array", items: { type: "string" } },
      evidence: { type: "array", items: { type: "string" } },
      recommendedAction: { type: "string" },
      needsLawyerConfirm: { type: "boolean" },
      reason: { type: "string", description: "If applies=false, why" },
    },
    required: ["applies"],
  },
};

async function checkRule(
  rule: PoaRedFlagRule,
  extraction: PoaExtraction,
): Promise<PoaRedFlag | null> {
  const prompt = `You are checking ONE PoA red-flag rule. Red flags are equity / fiduciary / abuse signals
that the supervising solicitor must consider — they are not pure compliance failures.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Trigger signals to look for:
${rule.triggerSignals.map((s) => `- ${s}`).join("\n")}

Detection instructions:
${rule.detectionPrompt}

Extracted PoA (JSON):
${JSON.stringify(extraction, null, 2)}

Be conservative. Only set applies=true where the trigger signals are clearly present in the
extraction. Otherwise applies=false with a one-line reason. Most red flags require lawyer
confirmation — set needsLawyerConfirm=true unless the irregularity is purely formal.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1500,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_red_flag" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`poa pass4: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as {
    applies: boolean;
    category?: PoaRedFlag["category"];
    title?: string;
    explanation?: string;
    signals?: string[];
    evidence?: string[];
    recommendedAction?: string;
    needsLawyerConfirm?: boolean;
  };
  if (!input.applies) return null;

  return PoaRedFlagSchema.parse({
    id: rule.id,
    severity: rule.severity,
    category: input.category ?? "other",
    title: input.title ?? rule.description,
    explanation: input.explanation ?? rule.description,
    signals: input.signals ?? [],
    evidence: input.evidence ?? [],
    recommendedAction: input.recommendedAction ?? "Refer to supervising solicitor for assessment.",
    citations: [
      { act: rule.citation.act, section: rule.citation.section, url: rule.citation.url },
    ],
    needsLawyerConfirm: input.needsLawyerConfirm ?? true,
  });
}

export interface DetectPoaRedFlagsOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function detectPoaRedFlags(
  extraction: PoaExtraction,
  opts: DetectPoaRedFlagsOptions = {},
): Promise<PoaRedFlag[]> {
  const rules = await loadRedFlagRules();
  const out: PoaRedFlag[] = [];
  const CONCURRENCY = 4;
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
    for (const f of checked) if (f) out.push(f);
  }
  return out;
}
