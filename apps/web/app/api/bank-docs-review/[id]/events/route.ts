import { reviewEventsGET } from "@/lib/api/review-routes";
import { getBankDocsReview, subscribeBankDocs } from "@/lib/store/bank-docs-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = reviewEventsGET({ get: getBankDocsReview, subscribe: subscribeBankDocs });
