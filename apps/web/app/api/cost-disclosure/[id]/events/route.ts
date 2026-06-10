import { reviewEventsGET } from "@/lib/api/review-routes";
import {
  getCostDisclosureReview,
  subscribeCostDisclosure,
} from "@/lib/store/cost-disclosure-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({
  get: getCostDisclosureReview,
  subscribe: subscribeCostDisclosure,
});
