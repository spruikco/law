import type Anthropic from "@anthropic-ai/sdk";

export const extractSpecialConditionsTool: Anthropic.Tool = {
  name: "record_special_conditions",
  description:
    "Record EVERY special condition found in the Contract of Sale. Do not summarise away conditions — include each one, even if it seems boilerplate.",
  input_schema: {
    type: "object",
    properties: {
      generalConditions: {
        type: "object",
        properties: {
          standardForm: { type: "string" },
          version: { type: "string" },
        },
        required: ["standardForm"],
      },
      specialConditions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "string" },
            heading: { type: "string" },
            fullText: { type: "string", description: "Full verbatim text" },
            summary: {
              type: "string",
              description: "One-sentence plain-English summary",
            },
            category: {
              type: "string",
              enum: [
                "conditions_precedent",
                "finance",
                "building_inspection",
                "pest_inspection",
                "sunset",
                "deposit",
                "variation_of_general_condition",
                "indemnity",
                "time_of_essence",
                "other",
              ],
            },
            variesGeneralCondition: {
              type: "string",
              description:
                "If this special condition varies a general condition, the GC number being varied",
            },
          },
          required: ["number", "fullText", "summary", "category"],
        },
      },
    },
    required: ["specialConditions"],
  },
};
