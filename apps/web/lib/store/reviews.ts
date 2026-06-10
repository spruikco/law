import type { Review, ReviewStatus } from "@law/schema";
import type { PipelineProgress } from "../pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
  type Upload,
} from "./create-review-store";

/** File-backed review store for the s32/CoS pipeline — see create-review-store.ts. */

const store = createReviewStore<Review, PipelineProgress>("reviews");

export type ProgressEnvelope = GenericEnvelope<Review, PipelineProgress>;

export async function createReview(uploads: Upload[]): Promise<Review> {
  return store.create(
    (base) => ({
      ...base,
      status: "pending",
      jurisdiction: "VIC",
      documents: [],
      compliance: [],
      risks: [],
    }),
    uploads,
  );
}

export const getUploads = store.getUploads;
export const releaseUploads = store.releaseUploads;
export const getReview = store.get;
export const updateReview = store.update;
export const emit = store.emit;
export const subscribe = store.subscribe;

export async function setStatus(id: string, status: ReviewStatus) {
  await store.setStatus(id, status);
}
