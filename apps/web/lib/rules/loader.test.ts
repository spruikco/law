import { describe, expect, it } from "vitest";
import { loadRules, loadUnenforceabilityRules } from "./loader";

/**
 * Regression guard for the rule packs: every YAML file the pipelines load
 * must parse and validate against its schema, so a malformed edit fails CI
 * instead of a live review.
 */

const STANDARD_RULE_FILES = [
  // property (s32/CoS)
  "s32-mandatory-disclosures.yaml",
  "oc-red-flags.yaml",
  "tax-triggers.yaml",
  "risky-special-conditions.yaml",
  // lease
  "lease-rla-mandatory.yaml",
  "lease-financial-obligations.yaml",
  "lease-tenant-adverse-patterns.yaml",
  // poa / wills
  "poa-validity.yaml",
  "wills-validity.yaml",
  // bank docs
  "bank-docs-statutory.yaml",
  "bank-docs-borrower-adverse.yaml",
  // practice modules
  "billing-lpul-pt43.yaml",
  "conveyance-settlement.yaml",
  "cost-disclosure-s174-checklist.yaml",
  "trust-accounting-lpul-pt42.yaml",
];

// bank-docs-unenforceability.yaml is loaded by the bank-docs pipeline's own
// schema (lib/bank-docs-pipeline/pass3b-unenforceability.ts), not this loader.
const UNENFORCEABILITY_RULE_FILES = ["lease-rla-unenforceability.yaml"];

describe("VIC rule packs", () => {
  it.each(STANDARD_RULE_FILES)("%s parses and validates", async (file) => {
    const rules = await loadRules(file);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.checkerPrompt.length).toBeGreaterThan(10);
    }
  });

  it.each(UNENFORCEABILITY_RULE_FILES)("%s parses and validates", async (file) => {
    const rules = await loadUnenforceabilityRules(file);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.detectInstructions.length).toBeGreaterThan(10);
    }
  });

  it("rule ids are unique within each file", async () => {
    for (const file of STANDARD_RULE_FILES) {
      const rules = await loadRules(file);
      const ids = rules.map((r) => r.id);
      expect(new Set(ids).size, `duplicate rule id in ${file}`).toBe(ids.length);
    }
  });
});

describe("jurisdiction fallback", () => {
  it("falls back to VIC when a jurisdiction has no rule pack", async () => {
    const vic = await loadRules("s32-mandatory-disclosures.yaml", "VIC");
    const nsw = await loadRules("s32-mandatory-disclosures.yaml", "NSW");
    expect(nsw).toEqual(vic);
  });
});
