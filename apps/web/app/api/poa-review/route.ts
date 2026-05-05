import { NextResponse, type NextRequest } from "next/server";
import { createPoaReview } from "@/lib/store/poa-reviews";
import { startPoaPipeline } from "@/lib/poa-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/poa-review
 *   multipart/form-data:
 *     files: PDF[]  (Power of Attorney instrument + any acceptance / witness certificates)
 *     clientName: string
 *     clientRole?: "principal" | "attorney" | "interested_party"
 *
 * Returns: { id: string }. Pipeline runs asynchronously.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const clientName = (form.get("clientName") as string | null)?.trim() || "Client";
  const role = (form.get("clientRole") as string | null) ?? "principal";
  const clientRole: "principal" | "attorney" | "interested_party" =
    role === "attorney" ? "attorney" : role === "interested_party" ? "interested_party" : "principal";
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

  const review = await createPoaReview(uploads);
  startPoaPipeline(review.id, { clientName, clientRole });
  return NextResponse.json({ id: review.id });
}
