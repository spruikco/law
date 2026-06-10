import { reviewEventsGET } from "@/lib/api/review-routes";
import { getConveyanceReview, subscribeConveyance } from "@/lib/store/conveyance-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({
  get: getConveyanceReview,
  subscribe: subscribeConveyance,
});
