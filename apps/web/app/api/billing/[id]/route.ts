import { reviewGET } from "@/lib/api/review-routes";
import { getBillingReview } from "@/lib/store/billing-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getBillingReview);
