import type { PoaReview, PoaReviewStatus } from "@law/schema";
import type { PoaPipelineProgress } from "../poa-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
  type Upload,
} from "./create-review-store";

/** File-backed Power of Attorney review store — see create-review-store.ts. */

const store = createReviewStore<PoaReview, PoaPipelineProgress>("poa-reviews");

export type PoaProgressEnvelope = GenericEnvelope<PoaReview, PoaPipelineProgress>;

export async function createPoaReview(uploads: Upload[]): Promise<PoaReview> {
  return store.create(
    (base) => ({
      ...base,
      kind: "poa",
      status: "pending",
      jurisdiction: "VIC",
      validityChecks: [],
      compliance: [],
      redFlags: [],
    }),
    uploads,
  );
}

export const getPoaUploads = store.getUploads;
export const releasePoaUploads = store.releaseUploads;
export const getPoaReview = store.get;
export const updatePoaReview = store.update;
export const emitPoa = store.emit;
export const subscribePoa = store.subscribe;

export async function setPoaStatus(id: string, status: PoaReviewStatus) {
  await store.setStatus(id, status);
}
