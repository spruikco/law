import type {
  ConveyanceReview,
  ConveyanceReviewStatus,
  SettlementInput,
} from "@law/schema";
import type { ConveyancePipelineProgress } from "../conveyance-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
} from "./create-review-store";

/** File-backed conveyance settlement review store — see create-review-store.ts. */

const store = createReviewStore<ConveyanceReview, ConveyancePipelineProgress>(
  "conveyance-reviews",
);

export type ConveyanceProgressEnvelope = GenericEnvelope<
  ConveyanceReview,
  ConveyancePipelineProgress
>;

export async function createConveyanceReview(
  input: SettlementInput,
): Promise<ConveyanceReview> {
  return store.create((base) => ({
    ...base,
    kind: "conveyance_settlement",
    status: "pending",
    jurisdiction: input.jurisdiction,
    input,
    findings: [],
  }));
}

export const getConveyanceReview = store.get;
export const updateConveyanceReview = store.update;
export const emitConveyance = store.emit;
export const subscribeConveyance = store.subscribe;

export async function setConveyanceStatus(id: string, status: ConveyanceReviewStatus) {
  await store.setStatus(id, status);
}
