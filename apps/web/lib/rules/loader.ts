import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Jurisdiction } from "@law/schema";

export const RuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  citation: z.object({
    act: z.string(),
    section: z.string(),
    url: z.string().url().optional(),
  }),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  applies: z
    .string()
    .optional()
    .describe("When this rule applies — e.g. 'owners_corp.applies === true'"),
  checkerPrompt: z
    .string()
    .describe("Prompt fragment instructing the model how to check this rule"),
});
export type Rule = z.infer<typeof RuleSchema>;

export const RulesFileSchema = z.object({
  title: z.string(),
  rules: z.array(RuleSchema),
});

// PRJ-693 capability 5: separate rule shape for unenforceability rules.
// Each rule emits an UnenforceabilityFinding (not a ComplianceFinding).
export const UnenforceabilityRuleSchema = z.object({
  id: z.string(),
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  trigger: z.object({
    act: z.string(),
    section: z.string(),
    url: z.string().url().optional(),
  }),
  landlordFailure: z.string(),
  effect: z.enum([
    "void",
    "not_liable_until_remedied",
    "right_to_recover",
    "right_to_terminate",
    "right_to_withhold",
  ]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  detectInstructions: z.string(),
  remedyTemplate: z.string(),
  needsLawyerConfirm: z.boolean().default(false),
});
export type UnenforceabilityRule = z.infer<typeof UnenforceabilityRuleSchema>;

export const UnenforceabilityRulesFileSchema = z.object({
  title: z.string(),
  rules: z.array(UnenforceabilityRuleSchema),
});

const ROOT = path.resolve(process.cwd(), "..", "..", "rules");

/**
 * Resolve a rules file for a given jurisdiction. If the requested
 * jurisdiction has no rule pack yet, fall back to VIC and warn.
 */
function resolveRulePath(jurisdiction: Jurisdiction, filename: string): string {
  const j = jurisdiction.toLowerCase();
  const primary = path.join(ROOT, j, filename);
  if (existsSync(primary)) return primary;
  if (jurisdiction !== "VIC") {
    console.warn(
      `[rules] no ${jurisdiction} rule pack for ${filename}; falling back to VIC`,
    );
  }
  return path.join(ROOT, "vic", filename);
}

export async function loadRules(
  filename: string,
  jurisdiction: Jurisdiction = "VIC",
): Promise<Rule[]> {
  const raw = await readFile(resolveRulePath(jurisdiction, filename), "utf8");
  const parsed = YAML.parse(raw);
  return RulesFileSchema.parse(parsed).rules;
}

export async function loadUnenforceabilityRules(
  filename: string,
  jurisdiction: Jurisdiction = "VIC",
): Promise<UnenforceabilityRule[]> {
  const raw = await readFile(resolveRulePath(jurisdiction, filename), "utf8");
  const parsed = YAML.parse(raw);
  return UnenforceabilityRulesFileSchema.parse(parsed).rules;
}
