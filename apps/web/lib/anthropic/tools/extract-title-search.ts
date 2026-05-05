import type Anthropic from "@anthropic-ai/sdk";

export const extractTitleSearchTool: Anthropic.Tool = {
  name: "record_title_search",
  description:
    "Record details from the title search attached to the s32. Include every encumbrance, easement, covenant, mortgage, and caveat.",
  input_schema: {
    type: "object",
    properties: {
      volumeFolio: { type: "string" },
      registeredProprietors: { type: "array", items: { type: "string" } },
      encumbrances: { type: "array", items: { type: "string" } },
      easements: { type: "array", items: { type: "string" } },
      covenants: { type: "array", items: { type: "string" } },
      mortgages: { type: "array", items: { type: "string" } },
      caveats: { type: "array", items: { type: "string" } },
    },
    required: [],
  },
};
