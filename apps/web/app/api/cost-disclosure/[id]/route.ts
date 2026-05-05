import { NextResponse } from "next/server";
import { getCostDisclosureReview } from "@/lib/store/cost-disclosure-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const review = await getCostDisclosureReview(id);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(review);
}
