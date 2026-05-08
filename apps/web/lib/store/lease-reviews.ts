import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeaseReview, LeaseReviewStatus } from "@law/schema";
import type { LeasePipelineProgress } from "../lease-pipeline/types";
import { repoRoot } from "../paths";

/**
 * File-backed lease review store — parallel to lib/store/reviews.ts for s32.
 * Writes each review to .cache/lease-reviews/{id}.json and broadcasts progress
 * events via an in-process listener map.
 */

const STORE_DIR = path.join(repoRoot(), ".cache", "lease-reviews");

type Listener = (evt: LeaseProgressEnvelope) => void;

export interface LeaseProgressEnvelope {
  reviewId: string;
  event: LeasePipelineProgress | { type: "review"; review: LeaseReview };
  at: number;
}

// Pin to globalThis so Turbopack module duplication in dev doesn't split the map.
type GlobalBag = {
  __leaseListeners?: Map<string, Set<Listener>>;
  __leaseUploads?: Map<string, Array<{ filename: string; bytes: Buffer }>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__leaseListeners ??= new Map());
const uploadCache: Map<string, Array<{ filename: string; bytes: Buffer }>> = (g.__leaseUploads ??=
  new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createLeaseReview(
  uploads: Array<{ filename: string; bytes: Buffer }>,
): Promise<LeaseReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: LeaseReview = {
    id,
    kind: "lease",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: "VIC",
    rlaCompliance: [],
    unenforceability: [],
    notificationObligations: [],
    optionAnalysis: [],
    marketReviewProjections: [],
    commentaryRisks: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  uploadCache.set(id, uploads);
  return review;
}

export function getLeaseUploads(
  id: string,
): Array<{ filename: string; bytes: Buffer }> | undefined {
  return uploadCache.get(id);
}

export function releaseLeaseUploads(id: string) {
  uploadCache.delete(id);
}

export async function getLeaseReview(id: string): Promise<LeaseReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as LeaseReview;
}

export async function updateLeaseReview(
  id: string,
  update: Partial<LeaseReview>,
): Promise<LeaseReview> {
  const existing = await getLeaseReview(id);
  if (!existing) throw new Error(`lease review ${id} not found`);
  const next: LeaseReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitLease(id, { type: "review", review: next });
  return next;
}

export async function setLeaseStatus(id: string, status: LeaseReviewStatus) {
  await updateLeaseReview(id, { status });
}

export function emitLease(
  reviewId: string,
  event: LeasePipelineProgress | { type: "review"; review: LeaseReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: LeaseProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeLease(
  reviewId: string,
  listener: Listener,
): () => void {
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
