import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CostDisclosureInput,
  CostDisclosureReview,
  CostDisclosureReviewStatus,
} from "@law/schema";
import type { CostDisclosurePipelineProgress } from "../cost-disclosure-pipeline/types";
import { repoRoot } from "../paths";

const STORE_DIR = path.join(repoRoot(), ".cache", "cost-disclosure-reviews");

type Listener = (evt: CostDisclosureProgressEnvelope) => void;

export interface CostDisclosureProgressEnvelope {
  reviewId: string;
  event: CostDisclosurePipelineProgress | { type: "review"; review: CostDisclosureReview };
  at: number;
}

type GlobalBag = {
  __cdListeners?: Map<string, Set<Listener>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__cdListeners ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createCostDisclosureReview(
  input: CostDisclosureInput,
): Promise<CostDisclosureReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: CostDisclosureReview = {
    id,
    kind: "cost_disclosure",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  return review;
}

export async function getCostDisclosureReview(
  id: string,
): Promise<CostDisclosureReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as CostDisclosureReview;
}

export async function updateCostDisclosureReview(
  id: string,
  update: Partial<CostDisclosureReview>,
): Promise<CostDisclosureReview> {
  const existing = await getCostDisclosureReview(id);
  if (!existing) throw new Error(`cost disclosure ${id} not found`);
  const next: CostDisclosureReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitCostDisclosure(id, { type: "review", review: next });
  return next;
}

export async function setCostDisclosureStatus(
  id: string,
  status: CostDisclosureReviewStatus,
) {
  await updateCostDisclosureReview(id, { status });
}

export function emitCostDisclosure(
  reviewId: string,
  event:
    | CostDisclosurePipelineProgress
    | { type: "review"; review: CostDisclosureReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: CostDisclosureProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeCostDisclosure(
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
