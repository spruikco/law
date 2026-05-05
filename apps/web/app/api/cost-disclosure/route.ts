import { NextResponse, type NextRequest } from "next/server";
import { CostDisclosureInputSchema } from "@law/schema";
import { createCostDisclosureReview } from "@/lib/store/cost-disclosure-reviews";
import { startCostDisclosurePipeline } from "@/lib/cost-disclosure-pipeline/runner";

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
  const parsed = CostDisclosureInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  }
  const review = await createCostDisclosureReview(parsed.data);
  startCostDisclosurePipeline(review.id);
  return NextResponse.json({ id: review.id });
}
