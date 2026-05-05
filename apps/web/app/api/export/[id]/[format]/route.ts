import { NextResponse } from "next/server";
import { getReview } from "@/lib/store/reviews";
import { renderLetterPdf } from "@/lib/export/pdf";
import { renderLetterDocx } from "@/lib/export/docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  const review = await getReview(id);
  if (!review || !review.letter) {
    return NextResponse.json({ error: "letter not ready" }, { status: 404 });
  }

  const safeProperty = review.letter.propertyAddress.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
  const filename = `letter-of-advice-${safeProperty}`;

  if (format === "pdf") {
    const pdf = await renderLetterPdf(review.letter);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }
  if (format === "docx") {
    const docx = await renderLetterDocx(review.letter);
    return new Response(new Uint8Array(docx), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
      },
    });
  }
  return NextResponse.json({ error: "unknown format" }, { status: 400 });
}
