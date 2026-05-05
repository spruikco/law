import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TrustAccountInput,
  TrustAccountReview,
  TrustAccountReviewStatus,
} from "@law/schema";
import type { TrustAccountPipelineProgress } from "../trust-accounting-pipeline/types";

const STORE_DIR = path.resolve(process.cwd(), "..", "..", ".cache", "trust-accounting-reviews");

type Listener = (evt: TrustAccountProgressEnvelope) => void;

export interface TrustAccountProgressEnvelope {
  reviewId: string;
  event: TrustAccountPipelineProgress | { type: "review"; review: TrustAccountReview };
  at: number;
}

type GlobalBag = {
  __taListeners?: Map<string, Set<Listener>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__taListeners ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createTrustAccountReview(
  input: TrustAccountInput,
): Promise<TrustAccountReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: TrustAccountReview = {
    id,
    kind: "trust_accounting",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  return review;
}

export async function getTrustAccountReview(
  id: string,
): Promise<TrustAccountReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as TrustAccountReview;
}

export async function updateTrustAccountReview(
  id: string,
  update: Partial<TrustAccountReview>,
): Promise<TrustAccountReview> {
  const existing = await getTrustAccountReview(id);
  if (!existing) throw new Error(`trust-accounting ${id} not found`);
  const next: TrustAccountReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitTrustAccount(id, { type: "review", review: next });
  return next;
}

export async function setTrustAccountStatus(
  id: string,
  status: TrustAccountReviewStatus,
) {
  await updateTrustAccountReview(id, { status });
}

export function emitTrustAccount(
  reviewId: string,
  event:
    | TrustAccountPipelineProgress
    | { type: "review"; review: TrustAccountReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: TrustAccountProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeTrustAccount(
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
