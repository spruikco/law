import type Anthropic from "@anthropic-ai/sdk";

export const extractOwnersCorpTool: Anthropic.Tool = {
  name: "record_owners_corporation",
  description:
    "Record Owners Corporation details from the Section 32 and any attached OC certificate. Look for: special levies, flagged future financial obligations (not just ongoing levies), damage to property, recent meeting minutes.",
  input_schema: {
    type: "object",
    properties: {
      applies: {
        type: "boolean",
        description: "Is the property subject to an Owners Corporation?",
      },
      planNumber: { type: "string" },
      ocManager: { type: "string" },
      annualFees: {
        type: "object",
        properties: { amount: { type: "number" }, raw: { type: "string" } },
      },
      specialLevies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            amount: {
              type: "object",
              properties: { amount: { type: "number" }, raw: { type: "string" } },
            },
            dueDate: { type: "string" },
          },
          required: ["description"],
        },
      },
      flaggedFutureObligations: {
        type: "array",
        items: { type: "string" },
        description:
          "Future financial obligations that MAY be levied (e.g. discussions of major works, reserves, sinking fund shortfalls) — NOT ongoing routine levies.",
      },
      damageToProperty: {
        type: "array",
        items: { type: "string" },
      },
      recentMeetingsSummary: { type: "string" },
      certificateAttached: { type: "boolean" },
    },
    required: ["applies", "certificateAttached"],
  },
};
