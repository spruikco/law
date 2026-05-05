import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import YAML from "yaml";
import { z } from "zod";
import {
  BankUnenforceabilityFindingSchema,
  type BankUnenforceabilityFinding,
  type BankDocsExtractionBundle,
  type Jurisdiction,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { retrieve } from "../rag";

/**
 * Bank-docs unenforceability has its own YAML shape (with `doctrine` and
 * `triggerSignals`) so we parse the rule pack here directly rather than
 * re-using lease's UnenforceabilityRule shape.
 */

const BankUnRuleSchema = z.object({
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
  effect: z.enum([
    "void",
    "voidable_at_borrower_election",
    "unenforceable_until_remedied",
    "court_may_reopen",
    "right_to_recover",
    "right_to_terminate",
    "unfair_term_and_voidable",
  ]),
  doctrine: z.enum([
    "ncc_unjust_transaction_s76",
    "ncc_unconscionable_interest_s78",
    "ncc_change_unjust_s77",
    "acl_unconscionable_s20",
    "acl_unconscionable_business_s21",
    "acl_misleading_s18",
    "acl_uct_pt2_3",
    "garcia_volunteer_guarantee",
    "amadio_special_disadvantage",
    "ppsa_unperfected_vesting_s267",
    "common_law_penalty",
    "other",
  ]),
});
type BankUnRule = z.infer<typeof BankUnRuleSchema>;

const RuleFileSchema = z.object({
  title: z.string(),
  rules: z.array(BankUnRuleSchema),
});

const ROOT = path.resolve(process.cwd(), "..", "..", "rules");
function resolveRulePath(jurisdiction: Jurisdiction, filename: string): string {
  const j = jurisdiction.toLowerCase();
  const primary = path.join(ROOT, j, filename);
  if (existsSync(primary)) return primary;
  return path.join(ROOT, "vic", filename);
}

async function loadBankUnRules(
  filename: string,
  jurisdiction: Jurisdiction = "VIC",
): Promise<BankUnRule[]> {
  const raw = await readFile(resolveRulePath(jurisdiction, filename), "utf8");
  const parsed = YAML.parse(raw);
  return RuleFileSchema.parse(parsed).rules;
}

const CHECK_TOOL: Anthropic.Tool = {
  name: "record_unenforceability",
  description:
    "Record an unenforceability finding for this rule. Call exactly once. If the rule does NOT apply to these documents, call with applies=false and a brief reason; the result will be discarded.",
  input_schema: {
    type: "object",
    properties: {
      applies: { type: "boolean" },
      lenderConductOrTerm: { type: "string" },
      detectionSignals: { type: "array", items: { type: "string" } },
      affectedClauses: { type: "array", items: { type: "string" } },
      estimatedExposureAud: { type: ["number", "null"] },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "Verbatim short quotes (≤25 words each) from the documents",
      },
      remedyForBorrower: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      needsLawyerConfirm: { type: "boolean" },
      reason: { type: "string", description: "If applies=false, why" },
    },
    required: ["applies"],
  },
};

interface CheckResult {
  applies: boolean;
  finding?: BankUnenforceabilityFinding;
}

async function checkUnRule(
  rule: BankUnRule,
  bundle: BankDocsExtractionBundle,
): Promise<CheckResult> {
  let retrievedBlock = "";
  try {
    const chunks = await retrieve(
      `${rule.description} ${rule.citation.act} ${rule.citation.section}`,
      { limit: 4 },
    );
    if (chunks.length > 0) {
      retrievedBlock =
        "\n\nRelevant statutory excerpts:\n" +
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

  const prompt = `You are checking ONE unenforceability rule against extracted bank-document data. These are HIGH VALUE findings — the rule, if triggered, gives the borrower / guarantor a substantive remedy (set aside, reopen, declare void, etc.).

Rule:
  id: ${rule.id}
  description: ${rule.description}
  citation: ${rule.citation.act} s ${rule.citation.section}
  doctrine: ${rule.doctrine}
  effect if triggered: ${rule.effect}
  default severity: ${rule.severity}

Trigger signals to look for:
${rule.triggerSignals.map((s) => `- ${s}`).join("\n")}

Detection instructions:
${rule.detectionPrompt}

Extracted bank-document bundle (JSON):
${JSON.stringify(bundle, null, 2)}
${retrievedBlock}

Be precise. Only set applies=true if the trigger signals are present in the documents OR the bundle. Set applies=false otherwise — do not speculate.

If applies=true, populate:
- lenderConductOrTerm — what the lender did or what the term says
- detectionSignals — which signals matched
- affectedClauses — the clause numbers / refs
- estimatedExposureAud — rough $ exposure or null
- evidence — verbatim short quotes
- remedyForBorrower — concrete next step
- confidence — 0..1
- needsLawyerConfirm — true if the finding turns on equity / commentary cases (Garcia, Amadio) and the solicitor must confirm`;

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1500,
    tools: [CHECK_TOOL],
    tool_choice: { type: "tool", name: "record_unenforceability" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`bank-docs pass3b: tool not called for rule '${rule.id}'`);
  }
  const input = toolUse.input as {
    applies: boolean;
    lenderConductOrTerm?: string;
    detectionSignals?: string[];
    affectedClauses?: string[];
    estimatedExposureAud?: number | null;
    evidence?: string[];
    remedyForBorrower?: string;
    confidence?: number;
    needsLawyerConfirm?: boolean;
  };

  if (!input.applies) return { applies: false };

  const finding = BankUnenforceabilityFindingSchema.parse({
    ruleId: rule.id,
    trigger: { act: rule.citation.act, section: rule.citation.section },
    doctrine: rule.doctrine,
    lenderConductOrTerm: input.lenderConductOrTerm ?? rule.description,
    detectionSignals: input.detectionSignals ?? [],
    affectedClauses: input.affectedClauses ?? [],
    effect: rule.effect,
    estimatedExposureAud:
      typeof input.estimatedExposureAud === "number" ? input.estimatedExposureAud : null,
    evidence: input.evidence ?? [],
    remedyForBorrower: input.remedyForBorrower ?? "",
    citations: [
      { act: rule.citation.act, section: rule.citation.section, url: rule.citation.url },
    ],
    severity: rule.severity,
    confidence: input.confidence ?? 0.6,
    needsLawyerConfirm: input.needsLawyerConfirm ?? false,
  });
  return { applies: true, finding };
}

const RULE_FILES = ["bank-docs-unenforceability.yaml"];

export interface CheckBankUnOptions {
  onRuleChecked?: (done: number, total: number, ruleId: string) => void;
}

export async function checkBankDocsUnenforceability(
  bundle: BankDocsExtractionBundle,
  opts: CheckBankUnOptions = {},
): Promise<BankUnenforceabilityFinding[]> {
  const allRules: BankUnRule[] = [];
  for (const f of RULE_FILES) {
    allRules.push(...(await loadBankUnRules(f)));
  }

  const findings: BankUnenforceabilityFinding[] = [];
  const CONCURRENCY = 4;
  let done = 0;
  for (let i = 0; i < allRules.length; i += CONCURRENCY) {
    const batch = allRules.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => {
        const result = await checkUnRule(r, bundle);
        done += 1;
        opts.onRuleChecked?.(done, allRules.length, r.id);
        return result;
      }),
    );
    for (const r of checked) if (r.applies && r.finding) findings.push(r.finding);
  }
  return findings;
}
