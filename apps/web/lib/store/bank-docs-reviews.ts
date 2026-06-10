import type { BankDocsReview, BankDocsReviewStatus } from "@law/schema";
import type { BankDocsPipelineProgress } from "../bank-docs-pipeline/types";
import {
  createReviewStore,
  type ProgressEnvelope as GenericEnvelope,
  type Upload,
} from "./create-review-store";

/** File-backed bank-docs review store — see create-review-store.ts. */

const store = createReviewStore<BankDocsReview, BankDocsPipelineProgress>("bank-docs-reviews");

export type BankDocsProgressEnvelope = GenericEnvelope<BankDocsReview, BankDocsPipelineProgress>;

export async function createBankDocsReview(uploads: Upload[]): Promise<BankDocsReview> {
  return store.create(
    (base) => ({
      ...base,
      kind: "bank_docs",
      status: "pending",
      jurisdiction: "VIC",
      compliance: [],
      unenforceability: [],
      repaymentScenarios: [],
      feeLadder: [],
      covenants: [],
      regulatoryHooks: [],
    }),
    uploads,
  );
}

export const getBankDocsUploads = store.getUploads;
export const releaseBankDocsUploads = store.releaseUploads;
export const getBankDocsReview = store.get;
export const updateBankDocsReview = store.update;
export const emitBankDocs = store.emit;
export const subscribeBankDocs = store.subscribe;

export async function setBankDocsStatus(id: string, status: BankDocsReviewStatus) {
  await store.setStatus(id, status);
}
