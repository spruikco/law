import { reviewEventsGET } from "@/lib/api/review-routes";
import { getBillingReview, subscribeBilling } from "@/lib/store/billing-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getBillingReview, subscribe: subscribeBilling });
