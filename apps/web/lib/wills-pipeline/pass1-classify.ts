import type Anthropic from "@anthropic-ai/sdk";
import { WillClassificationSchema, type WillClassification } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_will",
  description: "Record the classification of the uploaded will / codicil. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "formal_will",
          "codicil",
          "informal_document_s9",
          "mutual_will",
          "international_will",
          "statutory_will",
          "unknown",
        ],
      },
      isHomeMade: { type: "boolean" },
      hasFormalAttestation: { type: "boolean" },
      appearsRevoked: { type: "boolean" },
      hasInternationalElement: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
    },
    required: [
      "kind",
      "isHomeMade",
      "hasFormalAttestation",
      "confidence",
      "reasoning",
    ],
  },
};

export async function classifyWill(uploads: UploadedDocument[]): Promise<WillClassification> {
  const prompt = `You are classifying a will / codicil under the Wills Act 1997 (Vic).

Decide:
- kind: formal_will, codicil, informal_document_s9 (could be a curable s 9 document), mutual_will (reciprocal will language), international_will (Pt 2A), statutory_will (court-made under s 21).
- isHomeMade: not solicitor-prepared / no firm letterhead.
- hasFormalAttestation: attestation clause + 2 witnesses present.
- appearsRevoked: marked / crossed out / "void" stamps.
- hasInternationalElement: foreign assets / foreign domicile / international wills regime hint.
- confidence + reasoning (2 sentences).`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 1500,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_will" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("wills pass1: model did not call classify_will");
  }
  return WillClassificationSchema.parse(toolUse.input);
}
