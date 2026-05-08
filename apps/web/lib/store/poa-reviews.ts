import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoaReview, PoaReviewStatus } from "@law/schema";
import type { PoaPipelineProgress } from "../poa-pipeline/types";
import { repoRoot } from "../paths";

const STORE_DIR = path.join(repoRoot(), ".cache", "poa-reviews");

type Listener = (evt: PoaProgressEnvelope) => void;

export interface PoaProgressEnvelope {
  reviewId: string;
  event: PoaPipelineProgress | { type: "review"; review: PoaReview };
  at: number;
}

type GlobalBag = {
  __poaListeners?: Map<string, Set<Listener>>;
  __poaUploads?: Map<string, Array<{ filename: string; bytes: Buffer }>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__poaListeners ??= new Map());
const uploadCache: Map<string, Array<{ filename: string; bytes: Buffer }>> =
  (g.__poaUploads ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createPoaReview(
  uploads: Array<{ filename: string; bytes: Buffer }>,
): Promise<PoaReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: PoaReview = {
    id,
    kind: "poa",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: "VIC",
    validityChecks: [],
    compliance: [],
    redFlags: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  uploadCache.set(id, uploads);
  return review;
}

export function getPoaUploads(
  id: string,
): Array<{ filename: string; bytes: Buffer }> | undefined {
  return uploadCache.get(id);
}

export function releasePoaUploads(id: string) {
  uploadCache.delete(id);
}

export async function getPoaReview(id: string): Promise<PoaReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as PoaReview;
}

export async function updatePoaReview(
  id: string,
  update: Partial<PoaReview>,
): Promise<PoaReview> {
  const existing = await getPoaReview(id);
  if (!existing) throw new Error(`poa review ${id} not found`);
  const next: PoaReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitPoa(id, { type: "review", review: next });
  return next;
}

export async function setPoaStatus(id: string, status: PoaReviewStatus) {
  await updatePoaReview(id, { status });
}

export function emitPoa(
  reviewId: string,
  event: PoaPipelineProgress | { type: "review"; review: PoaReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: PoaProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribePoa(reviewId: string, listener: Listener): () => void {
  let set = listeners.get(reviewId);
  if (!set) {
    set = new Set();
    listeners.set(reviewId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(reviewId);
  };
}
