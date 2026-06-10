import { reviewEventsGET } from "@/lib/api/review-routes";
import { getLeaseReview, subscribeLease } from "@/lib/store/lease-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getLeaseReview, subscribe: subscribeLease });
