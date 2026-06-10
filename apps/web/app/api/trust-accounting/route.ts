import { TrustAccountInputSchema } from "@law/schema";
import { jsonReviewPOST } from "@/lib/api/review-routes";
import { createTrustAccountReview } from "@/lib/store/trust-accounting-reviews";
import { startTrustAccountPipeline } from "@/lib/trust-accounting-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = jsonReviewPOST({
  schema: TrustAccountInputSchema,
  create: createTrustAccountReview,
  start: startTrustAccountPipeline,
});
