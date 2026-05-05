import { NextResponse, type NextRequest } from "next/server";
import { createBankDocsReview } from "@/lib/store/bank-docs-reviews";
import { startBankDocsPipeline } from "@/lib/bank-docs-pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/bank-docs-review
 *   multipart/form-data:
 *     files: PDF[]  (mortgage / loan agreement / letter of offer / guarantee / GSA)
 *     clientName: string
 *     clientRole?: "borrower" | "guarantor"
 *
 * Returns: { id: string }. Pipeline runs asynchronously.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const clientName = (form.get("clientName") as string | null)?.trim() || "Borrower";
  const role = (form.get("clientRole") as string | null) ?? "borrower";
  const clientRole: "borrower" | "guarantor" =
    role === "guarantor" ? "guarantor" : "borrower";
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

  const review = await createBankDocsReview(uploads);
  startBankDocsPipeline(review.id, { clientName, clientRole });
  return NextResponse.json({ id: review.id });
}
