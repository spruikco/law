import type Anthropic from "@anthropic-ai/sdk";

export const extractLandTaxCertTool: Anthropic.Tool = {
  name: "record_land_tax_certificate",
  description:
    "Record Land Tax Certificate details. Flag commercial-property indicators — the Commercial & Industrial Property Tax Reform Act 2024 (Vic) has significant implications for commercial land.",
  input_schema: {
    type: "object",
    properties: {
      applicable: { type: "boolean" },
      assessmentYear: { type: "string" },
      amountOwing: {
        type: "object",
        properties: { amount: { type: "number" }, raw: { type: "string" } },
      },
      commercialIndicators: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
    },
    required: ["applicable"],
  },
};
