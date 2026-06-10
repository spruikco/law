import { reviewEventsGET } from "@/lib/api/review-routes";
import { getPoaReview, subscribePoa } from "@/lib/store/poa-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getPoaReview, subscribe: subscribePoa });
