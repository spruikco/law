import { CostDisclosureInputSchema } from "@law/schema";
import { jsonReviewPOST } from "@/lib/api/review-routes";
import { createCostDisclosureReview } from "@/lib/store/cost-disclosure-reviews";
import { startCostDisclosurePipeline } from "@/lib/cost-disclosure-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = jsonReviewPOST({
  schema: CostDisclosureInputSchema,
  create: createCostDisclosureReview,
  start: startCostDisclosurePipeline,
});
