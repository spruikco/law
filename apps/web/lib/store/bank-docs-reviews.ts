import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BankDocsReview, BankDocsReviewStatus } from "@law/schema";
import type { BankDocsPipelineProgress } from "../bank-docs-pipeline/types";

/**
 * File-backed bank-docs review store. Mirrors lease-reviews.
 */

const STORE_DIR = path.resolve(process.cwd(), "..", "..", ".cache", "bank-docs-reviews");

type Listener = (evt: BankDocsProgressEnvelope) => void;

export interface BankDocsProgressEnvelope {
  reviewId: string;
  event: BankDocsPipelineProgress | { type: "review"; review: BankDocsReview };
  at: number;
}

type GlobalBag = {
  __bankDocsListeners?: Map<string, Set<Listener>>;
  __bankDocsUploads?: Map<string, Array<{ filename: string; bytes: Buffer }>>;
};
const g = globalThis as unknown as GlobalBag;
const listeners: Map<string, Set<Listener>> = (g.__bankDocsListeners ??= new Map());
const uploadCache: Map<string, Array<{ filename: string; bytes: Buffer }>> =
  (g.__bankDocsUploads ??= new Map());

function reviewPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function createBankDocsReview(
  uploads: Array<{ filename: string; bytes: Buffer }>,
): Promise<BankDocsReview> {
  await mkdir(STORE_DIR, { recursive: true });
  const id = randomUUID();
  const review: BankDocsReview = {
    id,
    kind: "bank_docs",
    createdAt: new Date().toISOString(),
    status: "pending",
    jurisdiction: "VIC",
    compliance: [],
    unenforceability: [],
    repaymentScenarios: [],
    feeLadder: [],
    covenants: [],
    regulatoryHooks: [],
  };
  await writeFile(reviewPath(id), JSON.stringify(review, null, 2), "utf8");
  uploadCache.set(id, uploads);
  return review;
}

export function getBankDocsUploads(
  id: string,
): Array<{ filename: string; bytes: Buffer }> | undefined {
  return uploadCache.get(id);
}

export function releaseBankDocsUploads(id: string) {
  uploadCache.delete(id);
}

export async function getBankDocsReview(id: string): Promise<BankDocsReview | null> {
  if (!existsSync(reviewPath(id))) return null;
  const raw = await readFile(reviewPath(id), "utf8");
  return JSON.parse(raw) as BankDocsReview;
}

export async function updateBankDocsReview(
  id: string,
  update: Partial<BankDocsReview>,
): Promise<BankDocsReview> {
  const existing = await getBankDocsReview(id);
  if (!existing) throw new Error(`bank-docs review ${id} not found`);
  const next: BankDocsReview = { ...existing, ...update };
  await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
  emitBankDocs(id, { type: "review", review: next });
  return next;
}

export async function setBankDocsStatus(id: string, status: BankDocsReviewStatus) {
  await updateBankDocsReview(id, { status });
}

export function emitBankDocs(
  reviewId: string,
  event: BankDocsPipelineProgress | { type: "review"; review: BankDocsReview },
) {
  const set = listeners.get(reviewId);
  if (!set) return;
  const envelope: BankDocsProgressEnvelope = { reviewId, event, at: Date.now() };
  for (const l of set) l(envelope);
}

export function subscribeBankDocs(
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
