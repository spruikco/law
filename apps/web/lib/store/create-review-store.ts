import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "../paths";

/**
 * Generic file-backed review store — one instance per module. Swap the
 * persistence layer to Supabase when credentials land.
 *
 * Each review is written to .cache/{name}/{id}.json and updated in-place as
 * its pipeline progresses. Progress events fan out via an in-process listener
 * map so the module's /events SSE route can subscribe. Uploads are held in
 * memory until the pipeline releases them.
 */

export interface Upload {
  filename: string;
  bytes: Buffer;
}

export interface ProgressEnvelope<TReview, TProgress> {
  reviewId: string;
  event: TProgress | { type: "review"; review: TReview };
  at: number;
}

interface ReviewLike {
  id: string;
  createdAt: string;
  status: string;
}

export interface ReviewStore<TReview extends ReviewLike, TProgress> {
  /** Create and persist a new review. `build` receives the generated id/createdAt. */
  create(
    build: (base: { id: string; createdAt: string }) => TReview,
    uploads?: Upload[],
  ): Promise<TReview>;
  get(id: string): Promise<TReview | null>;
  update(id: string, update: Partial<TReview>): Promise<TReview>;
  setStatus(id: string, status: TReview["status"]): Promise<void>;
  emit(reviewId: string, event: TProgress | { type: "review"; review: TReview }): void;
  subscribe(
    reviewId: string,
    listener: (evt: ProgressEnvelope<TReview, TProgress>) => void,
  ): () => void;
  getUploads(id: string): Upload[] | undefined;
  releaseUploads(id: string): void;
}

// Pin per-store state to globalThis so Turbopack module duplication in dev
// doesn't split the listener/upload maps.
interface StoreState {
  listeners: Map<string, Set<(evt: ProgressEnvelope<never, never>) => void>>;
  uploads: Map<string, Upload[]>;
}
type GlobalBag = { __reviewStores?: Map<string, StoreState> };
const g = globalThis as unknown as GlobalBag;
const storeStates = (g.__reviewStores ??= new Map<string, StoreState>());

export function createReviewStore<TReview extends ReviewLike, TProgress>(
  name: string,
): ReviewStore<TReview, TProgress> {
  const dir = path.join(repoRoot(), ".cache", name);
  let state = storeStates.get(name);
  if (!state) {
    state = { listeners: new Map(), uploads: new Map() };
    storeStates.set(name, state);
  }
  type Listener = (evt: ProgressEnvelope<TReview, TProgress>) => void;
  const listeners = state.listeners as unknown as Map<string, Set<Listener>>;
  const uploadCache = state.uploads;

  const reviewPath = (id: string) => path.join(dir, `${id}.json`);

  const emit: ReviewStore<TReview, TProgress>["emit"] = (reviewId, event) => {
    const set = listeners.get(reviewId);
    if (!set) return;
    const envelope: ProgressEnvelope<TReview, TProgress> = { reviewId, event, at: Date.now() };
    for (const l of set) l(envelope);
  };

  const get = async (id: string): Promise<TReview | null> => {
    if (!existsSync(reviewPath(id))) return null;
    const raw = await readFile(reviewPath(id), "utf8");
    return JSON.parse(raw) as TReview;
  };

  const update = async (id: string, updateFields: Partial<TReview>): Promise<TReview> => {
    const existing = await get(id);
    if (!existing) throw new Error(`${name}: review ${id} not found`);
    const next: TReview = { ...existing, ...updateFields };
    await writeFile(reviewPath(id), JSON.stringify(next, null, 2), "utf8");
    emit(id, { type: "review", review: next });
    return next;
  };

  return {
    async create(build, uploads) {
      await mkdir(dir, { recursive: true });
      const review = build({ id: randomUUID(), createdAt: new Date().toISOString() });
      await writeFile(reviewPath(review.id), JSON.stringify(review, null, 2), "utf8");
      if (uploads) uploadCache.set(review.id, uploads);
      return review;
    },
    get,
    update,
    async setStatus(id, status) {
      await update(id, { status } as Partial<TReview>);
    },
    emit,
    subscribe(reviewId, listener) {
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
    },
    getUploads(id) {
      return uploadCache.get(id);
    },
    releaseUploads(id) {
      uploadCache.delete(id);
    },
  };
}
