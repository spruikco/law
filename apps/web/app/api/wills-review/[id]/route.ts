import { reviewGET } from "@/lib/api/review-routes";
import { getWillReview } from "@/lib/store/wills-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getWillReview);
