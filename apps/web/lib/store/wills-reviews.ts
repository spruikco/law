import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WillReview, WillReviewStatus } from "@law/schema";
import type { WillsPipelineProgress } from "../wills-pipeline/types";
import { repoRoot } from "../paths";

const STORE_DIR = path.join(repoRoot(), ".cache", "wills-reviews");

type Listener = (evt: WillsProgressEnvelope) => void;

export interface WillsProgressEnvelope {
  reviewId: string;
  event: WillsPipelineProgress | { type: "review"; review: WillReview };
  at: number;
}

type GlobalBag = {
  __willsListeners?: Map<string, Set<Listener>>;
  __willsUploads?: Map<string, Array<{ filename: string; bytes: Buffer }>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__willsListeners ??= new Map());
const uploadCache: Map<string, Array<{ filename: string; bytes: Buffer }>> =
  (g.__willsUploads ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createWillReview(
  uploads: Array<{ filename: string; bytes: Buffer }>,
): Promise<WillReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: WillReview = {
    id,
    kind: "will",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: "VIC",
    executionStatus: "unknown",
    findings: [],
    familyProvisionRisks: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  uploadCache.set(id, uploads);
  return review;
}

export function getWillsUploads(
  id: string,
): Array<{ filename: string; bytes: Buffer }> | undefined {
  return uploadCache.get(id);
}

export function releaseWillsUploads(id: string) {
  uploadCache.delete(id);
}

export async function getWillReview(id: string): Promise<WillReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as WillReview;
}

export async function updateWillReview(
  id: string,
  update: Partial<WillReview>,
): Promise<WillReview> {
  const existing = await getWillReview(id);
  if (!existing) throw new Error(`will review ${id} not found`);
  const next: WillReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitWills(id, { type: "review", review: next });
  return next;
}

export async function setWillsStatus(id: string, status: WillReviewStatus) {
  await updateWillReview(id, { status });
}

export function emitWills(
  reviewId: string,
  event: WillsPipelineProgress | { type: "review"; review: WillReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: WillsProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeWills(reviewId: string, listener: Listener): () => void {
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
