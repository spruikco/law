import { reviewGET } from "@/lib/api/review-routes";
import { getBankDocsReview } from "@/lib/store/bank-docs-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = reviewGET(getBankDocsReview);
