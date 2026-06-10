import { reviewGET } from "@/lib/api/review-routes";
import { getReview } from "@/lib/store/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getReview);
