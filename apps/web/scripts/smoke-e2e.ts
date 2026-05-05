#!/usr/bin/env tsx
/**
 * Run the full 5-pass pipeline against the sample PDFs.
 * Usage: npx tsx scripts/smoke-e2e.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), "..", "..", ".env.local") });

import { runPipeline } from "../lib/pipeline";
import type { UploadedDocument } from "../lib/pipeline/types";

async function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const files = [
    "SAMPLE-CONTRACT-OF-SALE-OF-LAND.pdf",
    "VIC-Section-32-Vendor-Statement-Sample.pdf",
  ];
  const uploads: UploadedDocument[] = await Promise.all(
    files.map(async (f) => ({
      filename: f,
      bytes: await readFile(path.join(root, f)),
    })),
  );

  const t0 = Date.now();
  const review = await runPipeline(
    {
      reviewId: "smoke-" + Date.now(),
      uploads,
      onProgress: async (evt) => {
        if (evt.type === "pass_start") console.log(`[pass ${evt.pass}] ${evt.label}`);
        if (evt.type === "pass_done") console.log(`[pass ${evt.pass}] done (${Date.now() - t0}ms total)`);
        if (evt.type === "letter_chunk") process.stdout.write(evt.text);
      },
    },
    { clientName: "Sample Client" },
  );

  console.log(`\n\n========= REVIEW COMPLETE (${Date.now() - t0}ms) =========`);
  console.log(`  property:        ${review.extraction?.particulars.propertyAddress}`);
  console.log(`  special cond.:   ${review.extraction?.specialConditions.length}`);
  console.log(`  compliance:      ${review.compliance.length} findings`);
  console.log(`    pass:          ${review.compliance.filter((c) => c.status === "pass").length}`);
  console.log(`    fail:          ${review.compliance.filter((c) => c.status === "fail").length}`);
  console.log(`    warning:       ${review.compliance.filter((c) => c.status === "warning").length}`);
  console.log(`    needs_review:  ${review.compliance.filter((c) => c.status === "needs_review").length}`);
  console.log(`  risks:           ${review.risks.length}`);
  console.log(`    critical:      ${review.risks.filter((r) => r.severity === "critical").length}`);
  console.log(`    high:          ${review.risks.filter((r) => r.severity === "high").length}`);
  console.log(`  letter sections: ${review.letter?.sections.length}`);

  const outDir = path.join(root, ".cache");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "smoke-e2e.json"),
    JSON.stringify(review, null, 2),
  );
  if (review.letter) {
    const md = review.letter.sections
      .map((s) => `## ${s.heading}\n\n${s.markdown}`)
      .join("\n\n");
    await writeFile(path.join(outDir, "smoke-e2e-letter.md"), md);
  }
  console.log(`\n  Full output: .cache/smoke-e2e.json`);
  console.log(`  Letter:      .cache/smoke-e2e-letter.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
