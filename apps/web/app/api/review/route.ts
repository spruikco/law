import { formString, uploadReviewPOST } from "@/lib/api/review-routes";
import { createReview } from "@/lib/store/reviews";
import { startPipeline } from "@/lib/pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 5-pass pipeline can run a few minutes
export const maxDuration = 600;

/**
 * POST /api/review
 *   multipart/form-data:
 *     files: PDF[]  (one or more)
 *     clientName: string
 */
export const POST = uploadReviewPOST({
  create: createReview,
  start: startPipeline,
  parseFields: (form) => ({ clientName: formString(form, "clientName", "Client") }),
});
