import { formString, uploadReviewPOST } from "@/lib/api/review-routes";
import { createLeaseReview } from "@/lib/store/lease-reviews";
import { startLeasePipeline } from "@/lib/lease-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/lease-review
 *   multipart/form-data:
 *     files: PDF[]  (the lease + any schedules / additional provisions)
 *     clientName: string (the tenant)
 */
export const POST = uploadReviewPOST({
  create: createLeaseReview,
  start: startLeasePipeline,
  parseFields: (form) => ({ clientName: formString(form, "clientName", "Tenant") }),
});
