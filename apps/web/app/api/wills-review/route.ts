import { NextResponse, type NextRequest } from "next/server";
import { createWillReview } from "@/lib/store/wills-reviews";
import { startWillsPipeline } from "@/lib/wills-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const clientName = (form.get("clientName") as string | null)?.trim() || "Client";
  const role = (form.get("clientRole") as string | null) ?? "testator";
  const allowed = ["testator", "executor", "beneficiary", "interested_party"] as const;
  const clientRole = (allowed as readonly string[]).includes(role)
    ? (role as (typeof allowed)[number])
    : "testator";
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

  const review = await createWillReview(uploads);
  startWillsPipeline(review.id, { clientName, clientRole });
  return NextResponse.json({ id: review.id });
}
