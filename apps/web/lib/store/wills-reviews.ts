import type { WillReview, WillReviewStatus } from "@law/schema";
import type { WillsPipelineProgress } from "../wills-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
  type Upload,
} from "./create-review-store";

/** File-backed wills review store — see create-review-store.ts. */

const store = createReviewStore<WillReview, WillsPipelineProgress>("wills-reviews");

export type WillsProgressEnvelope = GenericEnvelope<WillReview, WillsPipelineProgress>;

export async function createWillReview(uploads: Upload[]): Promise<WillReview> {
  return store.create(
    (base) => ({
      ...base,
      kind: "will",
      status: "pending",
      jurisdiction: "VIC",
      executionStatus: "unknown",
      findings: [],
      familyProvisionRisks: [],
    }),
    uploads,
  );
}

export const getWillsUploads = store.getUploads;
export const releaseWillsUploads = store.releaseUploads;
export const getWillReview = store.get;
export const updateWillReview = store.update;
export const emitWills = store.emit;
export const subscribeWills = store.subscribe;

export async function setWillsStatus(id: string, status: WillReviewStatus) {
  await store.setStatus(id, status);
}
