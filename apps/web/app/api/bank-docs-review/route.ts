import { formEnum, formString, uploadReviewPOST } from "@/lib/api/review-routes";
import { createBankDocsReview } from "@/lib/store/bank-docs-reviews";
import { startBankDocsPipeline } from "@/lib/bank-docs-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/bank-docs-review
 *   multipart/form-data:
 *     files: PDF[]  (mortgage / loan agreement / letter of offer / guarantee / GSA)
 *     clientName: string
 *     clientRole?: "borrower" | "guarantor"
 */
export const POST = uploadReviewPOST({
  create: createBankDocsReview,
  start: startBankDocsPipeline,
  parseFields: (form) => ({
    clientName: formString(form, "clientName", "Borrower"),
    clientRole: formEnum(form, "clientRole", ["borrower", "guarantor"] as const, "borrower"),
  }),
});
