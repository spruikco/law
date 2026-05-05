import type Anthropic from "@anthropic-ai/sdk";

export const extractServicesDisclosureTool: Anthropic.Tool = {
  name: "record_services_disclosure",
  description:
    "Record the s32 services disclosure (the X-box grid). IMPORTANT: in a Victorian s32, the box is marked with an X to indicate the service is NOT connected. Record `disclosureMarked=true` when an X is present, and set `connected` accordingly.",
  input_schema: {
    type: "object",
    properties: {
      services: {
        type: "array",
        items: {
          type: "object",
          properties: {
            service: {
              type: "string",
              enum: [
                "electricity",
                "gas",
                "water",
                "sewerage",
                "telephone",
                "other",
              ],
            },
            otherName: { type: "string" },
            connected: { type: "boolean" },
            disclosureMarked: { type: "boolean" },
          },
          required: ["service", "connected", "disclosureMarked"],
        },
      },
    },
    required: ["services"],
  },
};
