import { SettlementInputSchema } from "@law/schema";
import { jsonReviewPOST } from "@/lib/api/review-routes";
import { createConveyanceReview } from "@/lib/store/conveyance-reviews";
import { startConveyancePipeline } from "@/lib/conveyance-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = jsonReviewPOST({
  schema: SettlementInputSchema,
  create: createConveyanceReview,
  start: startConveyancePipeline,
});
