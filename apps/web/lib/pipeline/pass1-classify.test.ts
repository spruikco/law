import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyDocuments } from "./pass1-classify";

/**
 * Live-API smoke test against the bundled sample PDFs — the cheapest pass
 * that exercises the real Anthropic round-trip. Skipped when no key is set
 * (e.g. on forks / unauthenticated CI).
 */
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const samplesDir = path.join(__dirname, "..", "..", "public", "samples");

describe.skipIf(!hasKey)("pass1-classify (live API)", () => {
  it("classifies the sample Contract of Sale and Section 32", async () => {
    const uploads = await Promise.all(
      ["contract-of-sale.pdf", "section-32.pdf"].map(async (f) => ({
        filename: f,
        bytes: await readFile(path.join(samplesDir, f)),
      })),
    );
    const docs = await classifyDocuments(uploads);
    expect(docs).toHaveLength(2);
    const kinds = docs.map((d) => d.kind);
    expect(kinds).toContain("contract_of_sale");
    expect(kinds).toContain("section_32");
  });
});
