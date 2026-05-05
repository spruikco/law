import type Anthropic from "@anthropic-ai/sdk";
import type { ClassifiedDocument } from "@law/schema";
import { DocumentKind } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_documents",
  description:
    "Record a classification for each uploaded PDF. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      documents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceFilename: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "contract_of_sale",
                "section_32",
                "owners_corporation_certificate",
                "title_search",
                "land_tax_certificate",
                "unknown",
              ],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            pageRange: {
              type: "object",
              properties: {
                start: { type: "integer" },
                end: { type: "integer" },
              },
              required: ["start", "end"],
            },
          },
          required: ["sourceFilename", "kind", "confidence"],
        },
      },
    },
    required: ["documents"],
  },
};

const CLASSIFY_PROMPT = `You are reviewing PDFs uploaded for a Victorian property transaction review.

Classify each PDF as one of:
- contract_of_sale: the Contract of Sale of Real Estate (LIV/REIV form or similar)
- section_32: Vendor's Statement required under s32 Sale of Land Act 1962 (Vic)
- owners_corporation_certificate: OC certificate under the Owners Corporations Act
- title_search: Register Search Statement from Land Use Victoria
- land_tax_certificate: Land Tax Clearance Certificate from State Revenue Office
- unknown: anything else

Some PDFs bundle multiple documents — in that case pick the PRIMARY kind and set pageRange if the secondary section is clearly separated. Call the classify_documents tool once with one entry per uploaded PDF.`;

export async function classifyDocuments(
  uploads: UploadedDocument[],
): Promise<ClassifiedDocument[]> {
  if (uploads.length === 0) return [];

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: CLASSIFY_PROMPT });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 2048,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_documents" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("pass1-classify: model did not call the classify tool");
  }
  const input = toolUse.input as { documents: ClassifiedDocument[] };
  return input.documents.map((d) => ({
    ...d,
    kind: DocumentKind.parse(d.kind),
  }));
}
