import { NextResponse, type NextRequest } from "next/server";
import { createLeaseReview } from "@/lib/store/lease-reviews";
import { startLeasePipeline } from "@/lib/lease-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/lease-review
 *   multipart/form-data:
 *     files: PDF[]  (the lease + any schedules / additional provisions)
 *     clientName: string (the tenant)
 *
 * Returns: { id: string }. Pipeline runs asynchronously.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const clientName = (form.get("clientName") as string | null)?.trim() || "Tenant";
  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
  }

  const uploads = await Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  );

  const review = await createLeaseReview(uploads);
  startLeasePipeline(review.id, { clientName });
  return NextResponse.json({ id: review.id });
}
