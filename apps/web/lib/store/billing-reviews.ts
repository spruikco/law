import type { BillingInput, BillingReview, BillingReviewStatus } from "@law/schema";
import type { BillingPipelineProgress } from "../billing-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
} from "./create-review-store";

/** File-backed billing review store — see create-review-store.ts. */

const store = createReviewStore<BillingReview, BillingPipelineProgress>("billing-reviews");

export type BillingProgressEnvelope = GenericEnvelope<BillingReview, BillingPipelineProgress>;

export async function createBillingReview(input: BillingInput): Promise<BillingReview> {
  return store.create((base) => ({
    ...base,
    kind: "billing",
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  }));
}

export const getBillingReview = store.get;
export const updateBillingReview = store.update;
export const emitBilling = store.emit;
export const subscribeBilling = store.subscribe;

export async function setBillingStatus(id: string, status: BillingReviewStatus) {
  await store.setStatus(id, status);
}
