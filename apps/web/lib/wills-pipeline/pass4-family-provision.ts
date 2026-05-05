import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import YAML from "yaml";
import { z } from "zod";
import {
  FamilyProvisionRiskSchema,
  type FamilyProvisionRisk,
  type Jurisdiction,
  type WillExtraction,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const FpRuleSchema = z.object({
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
type FpRule = z.infer<typeof FpRuleSchema>;

const RuleFileSchema = z.object({
  title: z.string(),
  rules: z.array(FpRuleSchema),
});

const ROOT = path.resolve(process.cwd(), "..", "..", "rules");
function resolveRulePath(jurisdiction: Jurisdiction, filename: string): string {
  const j = jurisdiction.toLowerCase();
  const primary = path.join(ROOT, j, filename);
  if (existsSync(primary)) return primary;
  return path.join(ROOT, "vic", filename);
}

async function loadFpRules(jurisdiction: Jurisdiction = "VIC"): Promise<FpRule[]> {
  const raw = await readFile(
    resolveRulePath(jurisdiction, "wills-family-provision.yaml"),
    "utf8",
  );
  return RuleFileSchema.parse(YAML.parse(raw)).rules;
}

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_fp_risk",
  description:
    "Record a Pt IV family-provision exposure finding. If the rule does NOT apply, set applies=false with a brief reason.",
  input_schema: {
    type: "object",
    properties: {
      applies: { type: "boolean" },
      eligiblePerson: { type: "string" },
      eligibilityCategory: {
        type: "string",
        enum: [
          "spouse_or_domestic_partner",
          "former_spouse_or_domestic_partner",
          "child_under_18",
          "child_over_18_dependent",
          "child_assuming_responsibility",
          "stepchild_under_18",
          "stepchild_over_18_dependent",
          "registered_caring_partner",
          "grandchild_dependent",
          "household_member",
          "not_eligible",
        ],
      },
      reasoning: { type: "string" },
      estimatedExposure: { type: "string" },
      mitigations: { type: "array", items: { type: "string" } },
      reason: { type: "string" },
    },
    required: ["applies"],
  },
};

async function checkRule(
  rule: FpRule,
  extraction: WillExtraction,
): Promise<FamilyProvisionRisk | null> {
  const prompt = `You are checking ONE family-provision (TFM / Pt IV) exposure rule against
the extracted will.

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  default severity: ${rule.severity}

Trigger signals:
${rule.triggerSignals.map((s) => `- ${s}`).join("\n")}

Detection instructions:
${rule.detectionPrompt}

Extracted will (JSON):
${JSON.stringify(extraction, null, 2)}

Be conservative. Only set applies=true where the trigger signals are clearly present.
Otherwise applies=false with a one-line reason. The supervising solicitor will review.`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1500,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_fp_risk" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`wills pass4: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as {
    applies: boolean;
    eligiblePerson?: string;
    eligibilityCategory?: FamilyProvisionRisk["eligibilityCategory"];
    reasoning?: string;
    estimatedExposure?: string;
    mitigations?: string[];
  };
  if (!input.applies) return null;

  return FamilyProvisionRiskSchema.parse({
    eligiblePerson: input.eligiblePerson ?? "(unknown)",
    eligibilityCategory: input.eligibilityCategory ?? "not_eligible",
    severity: rule.severity,
    reasoning: input.reasoning ?? rule.description,
    estimatedExposure: input.estimatedExposure,
    mitigations: input.mitigations ?? [],
  });
}

export interface AnalyseFamilyProvisionOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function analyseFamilyProvision(
  extraction: WillExtraction,
  opts: AnalyseFamilyProvisionOptions = {},
): Promise<FamilyProvisionRisk[]> {
  const rules = await loadFpRules();
  const out: FamilyProvisionRisk[] = [];
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
