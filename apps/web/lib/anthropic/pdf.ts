import type Anthropic from "@anthropic-ai/sdk";

/**
 * Convert a PDF Buffer into an Anthropic document content block.
 * Claude accepts PDFs natively as base64 document blocks — no OCR required
 * for digital PDFs. See: https://docs.anthropic.com/en/docs/build-with-claude/pdf-support
 */
export function pdfBlock(
  pdf: Buffer | Uint8Array,
  title?: string,
): Anthropic.DocumentBlockParam {
  const base64 = Buffer.from(pdf).toString("base64");
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: base64,
    },
    ...(title ? { title } : {}),
    cache_control: { type: "ephemeral" },
  };
}
