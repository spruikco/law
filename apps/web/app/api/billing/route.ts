import { BillingInputSchema } from "@law/schema";
import { jsonReviewPOST } from "@/lib/api/review-routes";
import { createBillingReview } from "@/lib/store/billing-reviews";
import { startBillingPipeline } from "@/lib/billing-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = jsonReviewPOST({
  schema: BillingInputSchema,
  create: createBillingReview,
  start: startBillingPipeline,
});
