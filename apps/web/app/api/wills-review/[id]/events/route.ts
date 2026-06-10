import { reviewEventsGET } from "@/lib/api/review-routes";
import { getWillReview, subscribeWills } from "@/lib/store/wills-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getWillReview, subscribe: subscribeWills });
