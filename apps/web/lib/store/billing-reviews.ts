import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BillingInput,
  BillingReview,
  BillingReviewStatus,
} from "@law/schema";
import type { BillingPipelineProgress } from "../billing-pipeline/types";
import { repoRoot } from "../paths";

const STORE_DIR = path.join(repoRoot(), ".cache", "billing-reviews");

type Listener = (evt: BillingProgressEnvelope) => void;

export interface BillingProgressEnvelope {
  reviewId: string;
  event: BillingPipelineProgress | { type: "review"; review: BillingReview };
  at: number;
}

type GlobalBag = {
  __billingListeners?: Map<string, Set<Listener>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__billingListeners ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createBillingReview(input: BillingInput): Promise<BillingReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: BillingReview = {
    id,
    kind: "billing",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  return review;
}

export async function getBillingReview(id: string): Promise<BillingReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as BillingReview;
}

export async function updateBillingReview(
  id: string,
  update: Partial<BillingReview>,
): Promise<BillingReview> {
  const existing = await getBillingReview(id);
  if (!existing) throw new Error(`billing ${id} not found`);
  const next: BillingReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitBilling(id, { type: "review", review: next });
  return next;
}

export async function setBillingStatus(id: string, status: BillingReviewStatus) {
  await updateBillingReview(id, { status });
}

export function emitBilling(
  reviewId: string,
  event: BillingPipelineProgress | { type: "review"; review: BillingReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: BillingProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeBilling(reviewId: string, listener: Listener): () => void {
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
