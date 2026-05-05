#!/usr/bin/env tsx
/**
 * Legislation corpus ingestion.
 *
 * Reads Markdown files from packages/legislation/corpus/*.md, chunks each by
 * section/subsection heading, embeds with the app's embedding wrapper, and
 * stores in the JSON vector store consumed by the compliance pipeline.
 *
 * Each corpus file must start with a YAML front-matter block:
 * ---
 * act: Sale of Land Act 1962 (Vic)
 * versionDate: 2025-07-01
 * url: https://www.legislation.vic.gov.au/...
 * ---
 *
 * The body is Markdown. Sections are detected by headings in the form:
 *   `## 32 Vendor to give statement`
 *   `### 32(2)(a)`
 * The heading determines the chunk id + metadata.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { LegislationStore, type LegislationChunk } from "../../../apps/web/lib/rag/store";

const JURISDICTIONS = ["vic", "nsw", "qld", "wa", "sa", "act", "tas", "nt", "cth"] as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(__dirname, "..", "corpus");

interface Frontmatter {
  act: string;
  versionDate?: string;
  url?: string;
}

function parseFrontmatter(markdown: string): { meta: Frontmatter; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Corpus file missing required --- front-matter block");
  }
  const meta = YAML.parse(match[1]) as Frontmatter;
  if (!meta.act) throw new Error("Front-matter missing `act`");
  return { meta, body: match[2] };
}

function chunkBody(
  meta: Frontmatter,
  body: string,
  jurisdiction: string,
): LegislationChunk[] {
  // Split on headings, keeping the heading line with the chunk.
  const lines = body.split(/\r?\n/);
  const chunks: LegislationChunk[] = [];
  let current: { section?: string; subsection?: string; title?: string; buf: string[] } = { buf: [] };

  const flush = () => {
    const text = current.buf.join("\n").trim();
    if (!text || !current.section) return;
    chunks.push({
      id: `${jurisdiction}::${meta.act}::${current.section}${current.subsection ? "::" + current.subsection : ""}`,
      jurisdiction,
      act: meta.act,
      section: current.section,
      subsection: current.subsection,
      title: current.title,
      text,
      url: meta.url,
      versionDate: meta.versionDate,
    });
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      flush();
      const heading = h2[1].trim();
      // Expect "32 Vendor to give statement" — first token is the section number
      const m = heading.match(/^([\w.()]+)\s+(.*)$/);
      const section = m ? m[1] : heading;
      const title = m ? m[2] : undefined;
      current = { section, title, buf: [`## ${heading}`] };
    } else if (h3) {
      flush();
      const heading = h3[1].trim();
      const parentSection = current.section ?? "";
      current = {
        section: parentSection,
        subsection: heading,
        title: current.title,
        buf: [`### ${heading}`],
      };
    } else {
      current.buf.push(line);
    }
  }
  flush();
  return chunks;
}

async function collectJurisdictionFiles(
  jurisdiction: string,
): Promise<Array<{ file: string; full: string }>> {
  const dir = path.join(CORPUS_DIR, jurisdiction);
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return [];
  } catch {
    return [];
  }
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
  return files.map((f) => ({ file: f, full: path.join(dir, f) }));
}

async function main() {
  const store = new LegislationStore();
  await store.load();

  const allChunks: LegislationChunk[] = [];
  for (const j of JURISDICTIONS) {
    const files = await collectJurisdictionFiles(j);
    if (files.length === 0) continue;
    console.log(`\n[${j.toUpperCase()}]`);
    for (const { file, full } of files) {
      const raw = await readFile(full, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const chunks = chunkBody(meta, body, j.toUpperCase());
      allChunks.push(...chunks);
      console.log(`  ${file}: ${chunks.length} chunks`);
    }
  }

  if (allChunks.length === 0) {
    console.log(
      "No corpus .md files found. See packages/legislation/corpus/README.md for sources.",
    );
    return;
  }

  console.log(`\nEmbedding ${allChunks.length} chunks...`);
  // Batch embed to avoid running the model once per chunk
  const BATCH = 16;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    await store.upsert(batch);
    process.stdout.write(`  ${Math.min(i + BATCH, allChunks.length)}/${allChunks.length}\r`);
  }
  await store.save();
  console.log(`\nWrote ${store.size} chunks to store.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
