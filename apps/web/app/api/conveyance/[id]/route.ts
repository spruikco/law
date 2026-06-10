import { reviewGET } from "@/lib/api/review-routes";
import { getConveyanceReview } from "@/lib/store/conveyance-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getConveyanceReview);
