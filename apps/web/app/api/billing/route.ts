import { NextResponse, type NextRequest } from "next/server";
import { BillingInputSchema } from "@law/schema";
import { createBillingReview } from "@/lib/store/billing-reviews";
import { startBillingPipeline } from "@/lib/billing-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BillingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  }
  const review = await createBillingReview(parsed.data);
  startBillingPipeline(review.id);
  return NextResponse.json({ id: review.id });
}
