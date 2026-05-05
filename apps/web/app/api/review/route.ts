import { NextResponse, type NextRequest } from "next/server";
import { createReview } from "@/lib/store/reviews";
import { startPipeline } from "@/lib/pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 5-pass pipeline can run a few minutes
export const maxDuration = 600;

/**
 * POST /api/review
 *   multipart/form-data:
 *     files: PDF[]  (one or more)
 *     clientName: string
 *
 * Returns: { id: string }. Pipeline runs asynchronously; subscribe to
 * /api/review/[id]/events for progress and /api/review/[id] for state.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const clientName = (form.get("clientName") as string | null)?.trim() || "Client";
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

  const review = await createReview(uploads);
  startPipeline(review.id, { clientName });
  return NextResponse.json({ id: review.id });
}
