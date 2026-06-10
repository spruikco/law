import { reviewGET } from "@/lib/api/review-routes";
import { getLeaseReview } from "@/lib/store/lease-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getLeaseReview);
