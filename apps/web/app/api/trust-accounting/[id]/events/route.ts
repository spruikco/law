import { reviewEventsGET } from "@/lib/api/review-routes";
import {
  getTrustAccountReview,
  subscribeTrustAccount,
} from "@/lib/store/trust-accounting-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({
  get: getTrustAccountReview,
  subscribe: subscribeTrustAccount,
});
