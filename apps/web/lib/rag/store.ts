/**
 * JSON-backed vector store for legislation chunks.
 *
 * Chunks + embeddings live in a single JSON file on disk. At startup the
 * file is loaded into memory; retrieval does an in-memory cosine scan
 * (fine for O(thousands) of chunks).
 *
 * Later: swap this file for pgvector on Supabase without touching callers.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cosine, embed, EMBED_DIMS } from "./embed";

export interface LegislationChunk {
  id: string;
  /** Jurisdiction code (VIC, NSW, ...). Defaults to VIC for legacy chunks. */
  jurisdiction?: string;
  act: string;
  section: string;
  subsection?: string;
  title?: string;
  text: string;
  url?: string;
  versionDate?: string;
}

export interface StoredChunk extends LegislationChunk {
  /** base64-encoded Float32Array for JSON-serialisable embeddings */
  embedding: string;
}

export interface RetrievedChunk extends LegislationChunk {
  score: number;
}

/**
 * Anchor the store to the repo root by walking up from this source file
 * (`apps/web/lib/rag/store.ts` → four levels → repo root). This keeps ingest
 * (run from repo root) and the Next.js app (run from apps/web, and bundled
 * at build time) reading + writing the same file. Overridable via the
 * `LEGISLATION_STORE_PATH` env var — handy for tests and future swap-in of a
 * different backing store (pgvector on Supabase).
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const DEFAULT_STORE_PATH =
  process.env.LEGISLATION_STORE_PATH ??
  path.join(REPO_ROOT, ".cache", "legislation.json");

function encodeEmbedding(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}

function decodeEmbedding(s: string): Float32Array {
  const buf = Buffer.from(s, "base64");
  // Copy to align to Float32 boundary and avoid shared underlying buffer issues
  const aligned = new ArrayBuffer(buf.byteLength);
  new Uint8Array(aligned).set(buf);
  return new Float32Array(aligned);
}

export class LegislationStore {
  private chunks: StoredChunk[] = [];
  private storePath: string;
  private loaded = false;

  constructor(storePath: string = DEFAULT_STORE_PATH) {
    this.storePath = storePath;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (!existsSync(this.storePath)) {
      this.loaded = true;
      return;
    }
    const raw = await readFile(this.storePath, "utf8");
    this.chunks = JSON.parse(raw);
    this.loaded = true;
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.chunks, null, 0), "utf8");
  }

  async upsert(chunks: LegislationChunk[]): Promise<void> {
    await this.load();
    const texts = chunks.map((c) => `${c.title ?? ""}\n\n${c.text}`.trim());
    const vectors = await embed(texts);
    const byId = new Map(this.chunks.map((c) => [c.id, c] as const));
    for (let i = 0; i < chunks.length; i++) {
      const stored: StoredChunk = {
        ...chunks[i],
        embedding: encodeEmbedding(vectors[i]),
      };
      byId.set(stored.id, stored);
    }
    this.chunks = [...byId.values()];
  }

  async retrieve(
    query: string,
    opts: { limit?: number; filter?: { act?: string; jurisdiction?: string } } = {},
  ): Promise<RetrievedChunk[]> {
    await this.load();
    if (this.chunks.length === 0) return [];
    const [qvec] = await embed([query]);
    const limit = opts.limit ?? 6;
    const filter = opts.filter;
    const scored: RetrievedChunk[] = [];
    for (const c of this.chunks) {
      if (filter?.act && c.act !== filter.act) continue;
      if (filter?.jurisdiction) {
        const cj = c.jurisdiction ?? "VIC";
        // Cth law applies in every state — always retrievable alongside the
        // state-specific corpus.
        if (cj !== filter.jurisdiction && cj !== "CTH") continue;
      }
      const vec = decodeEmbedding(c.embedding);
      if (vec.length !== EMBED_DIMS) continue;
      const score = cosine(qvec, vec);
      scored.push({
        id: c.id,
        jurisdiction: c.jurisdiction,
        act: c.act,
        section: c.section,
        subsection: c.subsection,
        title: c.title,
        text: c.text,
        url: c.url,
        versionDate: c.versionDate,
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  get size(): number {
    return this.chunks.length;
  }
}

let _defaultStore: LegislationStore | null = null;
export function defaultStore(): LegislationStore {
  _defaultStore ??= new LegislationStore();
  return _defaultStore;
}
