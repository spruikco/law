#!/usr/bin/env tsx
/**
 * Run passes 1+2 against the sample PDFs in C:\LAW\ and dump the
 * structured output. Useful for validating extraction quality.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/smoke-extract.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local (loaded below).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env.local from repo root
loadEnv({ path: path.resolve(process.cwd(), "..", "..", ".env.local") });

import { classifyDocuments } from "../lib/pipeline/pass1-classify";
import { extractBundle } from "../lib/pipeline/pass2-extract";
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
  console.log(`Loaded ${uploads.length} sample PDFs`);
  for (const u of uploads) {
    console.log(`  ${u.filename}: ${(u.bytes.byteLength / 1024).toFixed(1)} KB`);
  }

  console.log("\n[pass 1] classify...");
  const t0 = Date.now();
  const classified = await classifyDocuments(uploads);
  console.log(`  done in ${Date.now() - t0}ms`);
  for (const c of classified) {
    console.log(`    ${c.sourceFilename} -> ${c.kind} (${c.confidence})`);
  }

  console.log("\n[pass 2] extract...");
  const t1 = Date.now();
  const bundle = await extractBundle(classified, uploads);
  console.log(`  done in ${Date.now() - t1}ms`);
  console.log(`    property: ${bundle.particulars.propertyAddress}`);
  console.log(`    price:    ${bundle.particulars.price.raw}`);
  console.log(`    deposit:  ${bundle.particulars.deposit.raw}`);
  console.log(`    settle:   ${bundle.particulars.settlementDate}`);
  console.log(`    parties:  ${bundle.particulars.parties.length}`);
  console.log(`    SCs:      ${bundle.specialConditions.length}`);
  console.log(`    services: ${bundle.servicesDisclosure.services.length}`);
  console.log(`    OC:       applies=${bundle.ownersCorp.applies}`);

  const outDir = path.join(root, ".cache");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "smoke-extract.json");
  await writeFile(outFile, JSON.stringify({ classified, bundle }, null, 2));
  console.log(`\nFull output: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
