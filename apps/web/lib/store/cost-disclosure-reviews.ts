import type {
  CostDisclosureInput,
  CostDisclosureReview,
  CostDisclosureReviewStatus,
} from "@law/schema";
import type { CostDisclosurePipelineProgress } from "../cost-disclosure-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
} from "./create-review-store";

/** File-backed cost-disclosure review store — see create-review-store.ts. */

const store = createReviewStore<CostDisclosureReview, CostDisclosurePipelineProgress>(
  "cost-disclosure-reviews",
);

export type CostDisclosureProgressEnvelope = GenericEnvelope<
  CostDisclosureReview,
  CostDisclosurePipelineProgress
>;

export async function createCostDisclosureReview(
  input: CostDisclosureInput,
): Promise<CostDisclosureReview> {
  return store.create((base) => ({
    ...base,
    kind: "cost_disclosure",
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  }));
}

export const getCostDisclosureReview = store.get;
export const updateCostDisclosureReview = store.update;
export const emitCostDisclosure = store.emit;
export const subscribeCostDisclosure = store.subscribe;

export async function setCostDisclosureStatus(
  id: string,
  status: CostDisclosureReviewStatus,
) {
  await store.setStatus(id, status);
}
