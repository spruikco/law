import { reviewGET } from "@/lib/api/review-routes";
import { getPoaReview } from "@/lib/store/poa-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getPoaReview);
