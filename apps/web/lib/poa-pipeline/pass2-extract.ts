import type Anthropic from "@anthropic-ai/sdk";
import {
  PoaExtractionSchema,
  type PoaClassification,
  type PoaExtraction,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_poa",
  description:
    "Extract the parties, witnesses, execution details, scope, and conflict / gift authorisations from the PoA document. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      principal: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          dateOfBirth: { type: "string" },
          capacityNote: { type: "string" },
        },
        required: ["name"],
      },
      attorneys: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: {
              type: "string",
              enum: ["primary", "alternate", "supportive", "other"],
            },
            relationshipToPrincipal: { type: "string" },
            acceptanceSigned: { type: "boolean" },
            acceptanceDate: { type: "string" },
            conflictOfInterestDisclosed: { type: "boolean" },
            conflictOfInterestDescription: { type: "string" },
          },
          required: ["name", "acceptanceSigned"],
        },
      },
      witnesses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            qualification: {
              type: "string",
              enum: [
                "authorised_witness",
                "registered_medical_practitioner",
                "person_authorised_to_witness_affidavits",
                "lawyer",
                "police_officer",
                "other",
                "unknown",
              ],
            },
            signatureDate: { type: "string" },
            certificateOfWitnessIncluded: { type: "boolean" },
          },
          required: ["name", "qualification"],
        },
      },
      executionDate: { type: "string" },
      effectiveTrigger: {
        type: "string",
        enum: [
          "immediately_on_signing",
          "on_loss_of_decision_making_capacity",
          "specified_event",
          "specified_date",
          "unknown",
        ],
      },
      scopeDescription: { type: "string" },
      conditionsAndLimitations: { type: "array", items: { type: "string" } },
      giftAuthorisations: { type: "array", items: { type: "string" } },
      conflictTransactionAuthorisations: { type: "array", items: { type: "string" } },
      remunerationProvisions: { type: "array", items: { type: "string" } },
      revocationClauses: { type: "array", items: { type: "string" } },
      observations: { type: "array", items: { type: "string" } },
    },
    required: ["principal", "attorneys", "witnesses"],
  },
};

export async function extractPoa(
  uploads: UploadedDocument[],
  classification: PoaClassification,
): Promise<PoaExtraction> {
  const prompt = `Extract the structured details of the Power of Attorney.

Classification: ${classification.kind} · isEnduring=${classification.isEnduring} · scope financial=${classification.scopeFinancial} personal=${classification.scopePersonal} medical=${classification.scopeMedical}

Quote verbatim where relevant — scope clause, gift authorisations, conflict-transaction authorisations, conditions / limitations.

For each attorney, decide whether the acceptance section is signed (acceptanceSigned). Quote acceptance date if dated.

For each witness, identify the qualification: authorised_witness (Oaths and Affirmations Act 2018), registered medical practitioner, person authorised to witness affidavits, lawyer, police officer, or other / unknown.

For effectiveTrigger pick: immediately_on_signing, on_loss_of_decision_making_capacity, specified_event, specified_date, or unknown.`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 6000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_poa" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("poa pass2: model did not call extract_poa");
  }
  const raw = toolUse.input as Record<string, unknown>;
  return PoaExtractionSchema.parse({
    classification,
    principal: raw.principal,
    attorneys: (raw.attorneys as unknown[] | undefined) ?? [],
    witnesses: (raw.witnesses as unknown[] | undefined) ?? [],
    executionDate: raw.executionDate as string | undefined,
    effectiveTrigger: (raw.effectiveTrigger as string | undefined) ?? "unknown",
    scopeDescription: raw.scopeDescription as string | undefined,
    conditionsAndLimitations: (raw.conditionsAndLimitations as string[] | undefined) ?? [],
    giftAuthorisations: (raw.giftAuthorisations as string[] | undefined) ?? [],
    conflictTransactionAuthorisations:
      (raw.conflictTransactionAuthorisations as string[] | undefined) ?? [],
    remunerationProvisions: (raw.remunerationProvisions as string[] | undefined) ?? [],
    revocationClauses: (raw.revocationClauses as string[] | undefined) ?? [],
    observations: (raw.observations as string[] | undefined) ?? [],
  });
}
