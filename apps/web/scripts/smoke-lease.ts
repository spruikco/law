#!/usr/bin/env tsx
/**
 * End-to-end smoke for the lease pipeline (PRJ-663 + PRJ-693).
 * Runs all six passes against SAMPLE-RETAIL-LEASE-POPULATED.pdf and writes
 * the full review + letter to .cache/.
 *
 * Usage: npx tsx scripts/smoke-lease.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), "..", "..", ".env.local") });

import { LeaseExtractionBundleSchema } from "@law/schema";
import { classifyLease } from "../lib/lease-pipeline/pass1-classify";
import { extractLeaseBundle } from "../lib/lease-pipeline/pass2-extract";
import { checkRlaCompliance } from "../lib/lease-pipeline/pass3-rla-compliance";
import { checkRlaUnenforceability } from "../lib/lease-pipeline/pass3b-unenforceability";
import { analyseAdditionalProvisions } from "../lib/lease-pipeline/pass4-clauses";
import { synthesiseCapabilities } from "../lib/lease-pipeline/pass6-capabilities";
import { composeLeaseLetter } from "../lib/lease-pipeline/pass5-compose";
import type { UploadedDocument } from "../lib/lease-pipeline/types";

async function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const files = ["SAMPLE-RETAIL-LEASE-POPULATED.pdf"];
  const uploads: UploadedDocument[] = await Promise.all(
    files.map(async (f) => ({
      filename: f,
      bytes: await readFile(path.join(root, f)),
    })),
  );

  const t0 = Date.now();
  const stamp = (label: string) =>
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

  // Pass 1
  stamp("pass 1 — classifying");
  const classification = await classifyLease(uploads);
  stamp(
    `  → ${classification.kind} · RLA ${classification.rlaApplies ? "applies" : "n/a"} · ${Math.round(classification.confidence * 100)}%`,
  );

  // Pass 2
  stamp("pass 2 — extracting");
  const { items, makeGood, outgoings, ongoingObligations } =
    await extractLeaseBundle(uploads);
  const extraction = LeaseExtractionBundleSchema.parse({
    classification,
    items,
    additionalProvisions: [],
    makeGood,
    outgoings,
    ongoingObligations,
  });
  stamp(
    `  → ${items.parties.length} parties · ${outgoings.excessiveItems.length} non-standard outgoings · make-good ${makeGood.severityRating ?? "n/a"} · ${ongoingObligations.items.length} ongoing obligation(s)`,
  );

  // Pass 3 — RLA compliance
  stamp("pass 3 — RLA compliance");
  const rlaCompliance = classification.rlaApplies
    ? await checkRlaCompliance(extraction, {
        onRuleChecked: (done, total, ruleId) => {
          if (done === total || done % 5 === 0) stamp(`    rule ${done}/${total} · ${ruleId}`);
        },
      })
    : [];
  stamp(`  → ${rlaCompliance.length} compliance findings`);

  // Pass 3b — unenforceability
  stamp("pass 3b — unenforceability (HIGH-VALUE)");
  const unenforceability = classification.rlaApplies
    ? await checkRlaUnenforceability(extraction, {
        onRuleChecked: (done, total, ruleId) =>
          stamp(`    rule ${done}/${total} · ${ruleId}`),
      })
    : [];
  stamp(`  → ${unenforceability.length} unenforceability findings`);
  for (const f of unenforceability) {
    stamp(
      `      [${f.severity}] ${f.trigger.act} s ${f.trigger.section} · effect=${f.effect} · exposure=${f.estimatedExposureAud ?? "—"} · conf=${f.confidence}`,
    );
  }

  // Pass 4 — clauses
  stamp("pass 4 — additional provisions analysis");
  const additionalProvisions = await analyseAdditionalProvisions(uploads, {
    classification,
    items,
    makeGood,
    outgoings,
    ongoingObligations,
  });
  const extractionWithProvisions = { ...extraction, additionalProvisions };
  stamp(
    `  → ${additionalProvisions.length} provisions · ${additionalProvisions.filter((p) => p.classification !== "standard").length} non-standard`,
  );

  // Pass 6 — capability synthesis
  stamp("pass 6 — capability synthesis");
  const caps = await synthesiseCapabilities({
    uploads,
    bundle: extractionWithProvisions,
    onProgress: (msg) => stamp(`    ${msg}`),
  });
  stamp(
    `  → ${caps.optionAnalysis.length} options · ${caps.notificationObligations.length} notifications · ${caps.marketReviewProjections.length} projections · LIV=${caps.livVersion?.isLiv ?? "—"} (${caps.livVersion?.detectedVersion ?? "—"}) · chain=${caps.leaseChain ? caps.leaseChain.documents.length + " docs" : "n/a"} · planning=${caps.planning ? "present" : "n/a"}`,
  );

  // Pass 5 — compose letter
  stamp("pass 5 — composing letter");
  const letter = await composeLeaseLetter({
    extraction: {
      ...extractionWithProvisions,
      makeGoodCostBand: caps.makeGoodCostBand,
      livVersion: caps.livVersion,
    },
    rlaCompliance,
    unenforceability,
    capabilities: caps,
    clientName: "Sample Tenant Pty Ltd",
  });
  stamp(`  → letter has ${letter.sections.length} sections`);

  // Summary + persist
  console.log(`\n========= LEASE REVIEW COMPLETE (${((Date.now() - t0) / 1000).toFixed(1)}s) =========`);
  console.log(`  premises:                ${items.premisesAddress}`);
  console.log(`  classification:          ${classification.kind} (RLA ${classification.rlaApplies ? "applies" : "n/a"})`);
  console.log(`  RLA compliance findings: ${rlaCompliance.length}`);
  console.log(`  unenforceability:        ${unenforceability.length}`);
  console.log(`    critical:              ${unenforceability.filter((u) => u.severity === "critical").length}`);
  console.log(`    high:                  ${unenforceability.filter((u) => u.severity === "high").length}`);
  console.log(`  additional provisions:   ${additionalProvisions.length}`);
  console.log(`  option analyses:         ${caps.optionAnalysis.length}`);
  console.log(`  notification obligations:${caps.notificationObligations.length}`);
  console.log(`  market projections:      ${caps.marketReviewProjections.length}`);
  console.log(`  make-good band:          ${caps.makeGoodCostBand?.band ?? "—"}`);
  console.log(`  LIV form:                ${caps.livVersion?.isLiv ? caps.livVersion.detectedVersion : "no"}`);
  console.log(`  lease chain:             ${caps.leaseChain?.documents.length ?? 0} docs`);
  console.log(`  letter sections:         ${letter.sections.length}`);

  const outDir = path.join(root, ".cache");
  await mkdir(outDir, { recursive: true });

  const fullReview = {
    classification,
    extraction: {
      ...extractionWithProvisions,
      makeGoodCostBand: caps.makeGoodCostBand,
      livVersion: caps.livVersion,
    },
    rlaCompliance,
    unenforceability,
    capabilities: caps,
    letter,
  };
  await writeFile(
    path.join(outDir, "smoke-lease.json"),
    JSON.stringify(fullReview, null, 2),
  );
  const md = letter.sections
    .map((s) => `## ${s.heading}\n\n${s.markdown}`)
    .join("\n\n");
  await writeFile(path.join(outDir, "smoke-lease-letter.md"), md);

  console.log(`\n  Full output: .cache/smoke-lease.json`);
  console.log(`  Letter:      .cache/smoke-lease-letter.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
