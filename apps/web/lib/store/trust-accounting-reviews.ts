import type {
  TrustAccountInput,
  TrustAccountReview,
  TrustAccountReviewStatus,
} from "@law/schema";
import type { TrustAccountPipelineProgress } from "../trust-accounting-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
} from "./create-review-store";

/** File-backed trust-accounting review store — see create-review-store.ts. */

const store = createReviewStore<TrustAccountReview, TrustAccountPipelineProgress>(
  "trust-accounting-reviews",
);

export type TrustAccountProgressEnvelope = GenericEnvelope<
  TrustAccountReview,
  TrustAccountPipelineProgress
>;

export async function createTrustAccountReview(
  input: TrustAccountInput,
): Promise<TrustAccountReview> {
  return store.create((base) => ({
    ...base,
    kind: "trust_accounting",
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  }));
}

export const getTrustAccountReview = store.get;
export const updateTrustAccountReview = store.update;
export const emitTrustAccount = store.emit;
export const subscribeTrustAccount = store.subscribe;

export async function setTrustAccountStatus(id: string, status: TrustAccountReviewStatus) {
  await store.setStatus(id, status);
}
