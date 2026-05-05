import { NextResponse, type NextRequest } from "next/server";
import { SettlementInputSchema } from "@law/schema";
import { createConveyanceReview } from "@/lib/store/conveyance-reviews";
import { startConveyancePipeline } from "@/lib/conveyance-pipeline/runner";

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
  const parsed = SettlementInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  }
  const review = await createConveyanceReview(parsed.data);
  startConveyancePipeline(review.id);
  return NextResponse.json({ id: review.id });
}
