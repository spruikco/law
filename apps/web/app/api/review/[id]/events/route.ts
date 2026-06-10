import { reviewEventsGET } from "@/lib/api/review-routes";
import { getReview, subscribe } from "@/lib/store/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getReview, subscribe });
