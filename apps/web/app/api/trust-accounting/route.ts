import { NextResponse, type NextRequest } from "next/server";
import { TrustAccountInputSchema } from "@law/schema";
import { createTrustAccountReview } from "@/lib/store/trust-accounting-reviews";
import { startTrustAccountPipeline } from "@/lib/trust-accounting-pipeline/runner";

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
  const parsed = TrustAccountInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  }
  const review = await createTrustAccountReview(parsed.data);
  startTrustAccountPipeline(review.id);
  return NextResponse.json({ id: review.id });
}
