import type { LeaseReview, LeaseReviewStatus } from "@law/schema";
import type { LeasePipelineProgress } from "../lease-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
  type Upload,
} from "./create-review-store";

/** File-backed lease review store — see create-review-store.ts. */

const store = createReviewStore<LeaseReview, LeasePipelineProgress>("lease-reviews");

export type LeaseProgressEnvelope = GenericEnvelope<LeaseReview, LeasePipelineProgress>;

export async function createLeaseReview(uploads: Upload[]): Promise<LeaseReview> {
  return store.create(
    (base) => ({
      ...base,
      kind: "lease",
      status: "pending",
      jurisdiction: "VIC",
      rlaCompliance: [],
      unenforceability: [],
      notificationObligations: [],
      optionAnalysis: [],
      marketReviewProjections: [],
      commentaryRisks: [],
    }),
    uploads,
  );
}

export const getLeaseUploads = store.getUploads;
export const releaseLeaseUploads = store.releaseUploads;
export const getLeaseReview = store.get;
export const updateLeaseReview = store.update;
export const emitLease = store.emit;
export const subscribeLease = store.subscribe;

export async function setLeaseStatus(id: string, status: LeaseReviewStatus) {
  await store.setStatus(id, status);
}
