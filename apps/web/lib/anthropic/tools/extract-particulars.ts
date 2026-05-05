import type Anthropic from "@anthropic-ai/sdk";

export const extractParticularsTool: Anthropic.Tool = {
  name: "record_particulars",
  description:
    "Record the particulars of sale extracted from a Victorian Contract of Sale. Call exactly once with all fields you can find.",
  input_schema: {
    type: "object",
    properties: {
      propertyAddress: { type: "string" },
      titleReference: { type: "string" },
      price: {
        type: "object",
        properties: {
          amount: { type: "number" },
          raw: { type: "string", description: "Original text, e.g. '$1,250,000'" },
        },
        required: ["amount", "raw"],
      },
      deposit: {
        type: "object",
        properties: {
          amount: { type: "number" },
          raw: { type: "string" },
        },
        required: ["amount", "raw"],
      },
      settlementDate: {
        type: "string",
        description: "ISO date if fixed, otherwise phrase like '60 days from contract'",
      },
      parties: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: [
                "vendor",
                "purchaser",
                "vendor_agent",
                "purchaser_agent",
                "other",
              ],
            },
            name: { type: "string" },
            acn_or_abn: { type: "string" },
            address: { type: "string" },
          },
          required: ["role", "name"],
        },
      },
      gstTreatment: {
        type: "string",
        description: "E.g. 'plus GST', 'inclusive', 'margin scheme'",
      },
    },
    required: ["propertyAddress", "price", "deposit", "settlementDate", "parties"],
  },
};
