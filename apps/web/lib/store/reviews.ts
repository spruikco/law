import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Review, ReviewStatus } from "@law/schema";
import type { PipelineProgress } from "../pipeline/types";
import { repoRoot } from "../paths";

/**
 * File-backed review store. Swap to Supabase when credentials land.
 *
 * Each review is written to .cache/reviews/{id}.json and updated in-place
 * as the pipeline progresses. Progress events are streamed via an EventEmitter
 * so /api/review/[id]/events can subscribe.
 */

const STORE_DIR = path.join(repoRoot(), ".cache", "reviews");

type Listener = (evt: ProgressEnvelope) => void;

export interface ProgressEnvelope {
  reviewId: string;
  event: PipelineProgress | { type: "review"; review: Review };
  at: number;
}

const listeners = new Map<string, Set<Listener>>();
const uploadCache = new Map<string, Array<{ filename: string; bytes: Buffer }>>();

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createReview(uploads: Array<{ filename: string; bytes: Buffer }>): Promise<Review> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: Review = {
    id,
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: "VIC",
    documents: [],
    compliance: [],
    risks: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  uploadCache.set(id, uploads);
  return review;
}

export function getUploads(id: string): Array<{ filename: string; bytes: Buffer }> | undefined {
  return uploadCache.get(id);
}

export function releaseUploads(id: string) {
  uploadCache.delete(id);
}

export async function getReview(id: string): Promise<Review | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as Review;
}

export async function updateReview(id: string, update: Partial<Review>): Promise<Review> {
  const existing = await getReview(id);
  if (!existing) throw new Error(`review ${id} not found`);
  const next: Review = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emit(id, { type: "review", review: next });
  return next;
}

export async function setStatus(id: string, status: ReviewStatus) {
  await updateReview(id, { status });
}

export function emit(reviewId: string, event: PipelineProgress | { type: "review"; review: Review }) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: ProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribe(reviewId: string, listener: Listener): () => void {
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
