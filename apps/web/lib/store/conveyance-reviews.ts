import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ConveyanceReview,
  ConveyanceReviewStatus,
  SettlementInput,
} from "@law/schema";
import type { ConveyancePipelineProgress } from "../conveyance-pipeline/types";
import { repoRoot } from "../paths";

const STORE_DIR = path.join(repoRoot(), ".cache", "conveyance-reviews");

type Listener = (evt: ConveyanceProgressEnvelope) => void;

export interface ConveyanceProgressEnvelope {
  reviewId: string;
  event: ConveyancePipelineProgress | { type: "review"; review: ConveyanceReview };
  at: number;
}

type GlobalBag = {
  __cvListeners?: Map<string, Set<Listener>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__cvListeners ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createConveyanceReview(
  input: SettlementInput,
): Promise<ConveyanceReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: ConveyanceReview = {
    id,
    kind: "conveyance_settlement",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  return review;
}

export async function getConveyanceReview(
  id: string,
): Promise<ConveyanceReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as ConveyanceReview;
}

export async function updateConveyanceReview(
  id: string,
  update: Partial<ConveyanceReview>,
): Promise<ConveyanceReview> {
  const existing = await getConveyanceReview(id);
  if (!existing) throw new Error(`conveyance ${id} not found`);
  const next: ConveyanceReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitConveyance(id, { type: "review", review: next });
  return next;
}

export async function setConveyanceStatus(
  id: string,
  status: ConveyanceReviewStatus,
) {
  await updateConveyanceReview(id, { status });
}

export function emitConveyance(
  reviewId: string,
  event:
    | ConveyancePipelineProgress
    | { type: "review"; review: ConveyanceReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: ConveyanceProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeConveyance(
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
