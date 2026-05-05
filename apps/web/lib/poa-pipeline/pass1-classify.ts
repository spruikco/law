import type Anthropic from "@anthropic-ai/sdk";
import { PoaClassificationSchema, type PoaClassification } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_poa",
  description:
    "Record the classification of the uploaded Power of Attorney document. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "general_non_enduring",
          "general_enduring",
          "financial_enduring",
          "personal_enduring",
          "medical_treatment_decision_maker",
          "supportive",
          "appointment_of_enduring_guardian",
          "company_poa",
          "unknown",
        ],
      },
      isEnduring: { type: "boolean" },
      scopeFinancial: { type: "boolean" },
      scopePersonal: { type: "boolean" },
      scopeMedical: { type: "boolean" },
      formIsStatutoryPrescribed: { type: "boolean" },
      multipleAttorneys: { type: "boolean" },
      appointmentMode: {
        type: "string",
        enum: ["sole", "joint", "joint_and_several", "majority", "alternating", "n/a"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
    },
    required: [
      "kind",
      "isEnduring",
      "scopeFinancial",
      "scopePersonal",
      "scopeMedical",
      "formIsStatutoryPrescribed",
      "multipleAttorneys",
      "confidence",
      "reasoning",
    ],
  },
};

export async function classifyPoa(uploads: UploadedDocument[]): Promise<PoaClassification> {
  const prompt = `You are classifying a Power of Attorney document under the Powers of Attorney Act 2014 (Vic).

Decide:
- kind: which kind of PoA — financial enduring, personal enduring, general non-enduring, MTDM (Medical Treatment Decision Maker, under Medical Treatment Planning and Decisions Act 2016), supportive (under PoA Act Pt 6), appointment of enduring guardian (pre-2014, may still be valid), company PoA (under Corporations Act).
- isEnduring: continues despite loss of capacity.
- scopeFinancial / scopePersonal / scopeMedical: which decision domains it covers.
- formIsStatutoryPrescribed: whether the form follows PoA Regulations 2015 Sch 1 (or substantially complies).
- multipleAttorneys + appointmentMode: count and mode (joint / J&S / majority / alternating / sole).
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
    tool_choice: { type: "tool", name: "classify_poa" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("poa pass1: model did not call classify_poa");
  }
  const input = toolUse.input as Record<string, unknown>;
  return PoaClassificationSchema.parse({
    ...input,
    appointmentMode: input.appointmentMode ?? "n/a",
  });
}
