#!/usr/bin/env tsx
/**
 * Test PDF + DOCX export using the cached E2E output.
 * Usage: npx tsx scripts/smoke-export.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), "..", "..", ".env.local") });

import { renderLetterPdf } from "../lib/export/pdf";
import { renderLetterDocx } from "../lib/export/docx";
import type { Review } from "@law/schema";

async function main() {
  const cached = path.resolve(process.cwd(), "..", "..", ".cache", "smoke-e2e.json");
  const review = JSON.parse(await readFile(cached, "utf8")) as Review;
  if (!review.letter) throw new Error("cached review has no letter");

  const outDir = path.dirname(cached);
  console.log("Rendering PDF...");
  const pdf = await renderLetterPdf(review.letter);
  await writeFile(path.join(outDir, "smoke-letter.pdf"), pdf);
  console.log(`  ${pdf.byteLength} bytes -> .cache/smoke-letter.pdf`);

  console.log("Rendering DOCX...");
  const docx = await renderLetterDocx(review.letter);
  await writeFile(path.join(outDir, "smoke-letter.docx"), docx);
  console.log(`  ${docx.byteLength} bytes -> .cache/smoke-letter.docx`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
