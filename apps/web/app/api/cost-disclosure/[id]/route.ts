import { reviewGET } from "@/lib/api/review-routes";
import { getCostDisclosureReview } from "@/lib/store/cost-disclosure-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getCostDisclosureReview);
