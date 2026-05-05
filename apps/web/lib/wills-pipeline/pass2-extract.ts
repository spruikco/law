import type Anthropic from "@anthropic-ai/sdk";
import {
  WillExtractionSchema,
  type WillClassification,
  type WillExtraction,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_will",
  description:
    "Extract testator, executors, witnesses, beneficiaries, gifts, residue, and other testamentary particulars. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      testator: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          dateOfBirth: { type: "string" },
          occupation: { type: "string" },
          capacityNote: { type: "string" },
        },
        required: ["name"],
      },
      executionDate: { type: "string" },
      placeOfExecution: { type: "string" },
      executors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string", enum: ["primary", "alternate", "co", "trustee"] },
            relationshipToTestator: { type: "string" },
            isBeneficiary: { type: "boolean" },
            remunerationProvided: { type: "boolean" },
          },
          required: ["name"],
        },
      },
      witnesses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            occupation: { type: "string" },
            address: { type: "string" },
            isBeneficiaryOrSpouseOfBeneficiary: { type: "boolean" },
          },
          required: ["name"],
        },
      },
      beneficiaries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            relationshipToTestator: { type: "string" },
            giftType: {
              type: "string",
              enum: ["specific", "demonstrative", "general", "pecuniary", "residuary"],
            },
            description: { type: "string" },
            isContingent: { type: "boolean" },
            contingencyDescription: { type: "string" },
            ademptionRisk: { type: "boolean" },
            isEligibleAPActPt4: { type: "boolean" },
          },
          required: ["name", "giftType", "description"],
        },
      },
      hasResidueClause: { type: "boolean" },
      residueDescription: { type: "string" },
      hasGuardianshipClause: { type: "boolean" },
      guardianshipDescription: { type: "string" },
      hasFuneralDirections: { type: "boolean" },
      funeralDirections: { type: "string" },
      bindingDeathBenefitNominations: { type: "array", items: { type: "string" } },
      superFundsReferenced: { type: "array", items: { type: "string" } },
      testamentaryTrustsReferenced: { type: "array", items: { type: "string" } },
      revocationClause: { type: "string" },
      hasAttestationClause: { type: "boolean" },
      attestationClauseText: { type: "string" },
      observations: { type: "array", items: { type: "string" } },
    },
    required: ["testator", "executors", "witnesses", "beneficiaries", "hasResidueClause"],
  },
};

export async function extractWill(
  uploads: UploadedDocument[],
  classification: WillClassification,
): Promise<WillExtraction> {
  const prompt = `Extract the structured details of the will.

Classification: ${classification.kind} · home-made=${classification.isHomeMade} · formal attestation=${classification.hasFormalAttestation}

Quote scope / gift / residue / attestation language verbatim where relevant.

For each beneficiary:
- giftType: specific / demonstrative / general / pecuniary / residuary
- ademptionRisk: true if it's a specific gift of an asset that may not exist at death
- isEligibleAPActPt4: true if the named beneficiary is in eligible-person classes under
  AP Act 1958 (Vic) s 90 (spouse / domestic partner / child / stepchild / dependent /
  registered carer)

For each witness, decide isBeneficiaryOrSpouseOfBeneficiary by cross-referencing the
beneficiaries list.

Quote the attestation clause verbatim if present.`;

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
    tool_choice: { type: "tool", name: "extract_will" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("wills pass2: model did not call extract_will");
  }
  const raw = toolUse.input as Record<string, unknown>;
  return WillExtractionSchema.parse({
    classification,
    testator: raw.testator,
    executionDate: raw.executionDate,
    placeOfExecution: raw.placeOfExecution,
    executors: (raw.executors as unknown[] | undefined) ?? [],
    witnesses: (raw.witnesses as unknown[] | undefined) ?? [],
    beneficiaries: (raw.beneficiaries as unknown[] | undefined) ?? [],
    hasResidueClause: raw.hasResidueClause ?? false,
    residueDescription: raw.residueDescription,
    hasGuardianshipClause: raw.hasGuardianshipClause ?? false,
    guardianshipDescription: raw.guardianshipDescription,
    hasFuneralDirections: raw.hasFuneralDirections ?? false,
    funeralDirections: raw.funeralDirections,
    bindingDeathBenefitNominations:
      (raw.bindingDeathBenefitNominations as string[] | undefined) ?? [],
    superFundsReferenced: (raw.superFundsReferenced as string[] | undefined) ?? [],
    testamentaryTrustsReferenced:
      (raw.testamentaryTrustsReferenced as string[] | undefined) ?? [],
    revocationClause: raw.revocationClause,
    hasAttestationClause: raw.hasAttestationClause ?? false,
    attestationClauseText: raw.attestationClauseText,
    observations: (raw.observations as string[] | undefined) ?? [],
  });
}
