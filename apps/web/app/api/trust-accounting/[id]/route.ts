import { reviewGET } from "@/lib/api/review-routes";
import { getTrustAccountReview } from "@/lib/store/trust-accounting-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getTrustAccountReview);
