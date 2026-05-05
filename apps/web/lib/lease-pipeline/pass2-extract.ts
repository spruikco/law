import type Anthropic from "@anthropic-ai/sdk";
import {
  LeaseItemsSchema,
  MakeGoodAssessmentSchema,
  OutgoingsAssessmentSchema,
  OngoingFinancialObligationsSchema,
  type LeaseItems,
  type MakeGoodAssessment,
  type OutgoingsAssessment,
  type OngoingFinancialObligations,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const ITEMS_TOOL: Anthropic.Tool = {
  name: "record_lease_items",
  description:
    "Record the items / particulars from the lease schedule. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      premisesAddress: { type: "string" },
      premisesDescription: { type: "string" },
      parties: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: ["landlord", "tenant", "guarantor", "agent", "other"],
            },
            name: { type: "string" },
            acn_or_abn: { type: "string" },
            address: { type: "string" },
          },
          required: ["role", "name"],
        },
      },
      permittedUse: { type: "string" },
      commencementDate: { type: "string" },
      termYears: { type: "number" },
      termDescription: { type: "string" },
      optionTerms: { type: "array", items: { type: "string" } },
      commencingRent: {
        type: "object",
        properties: {
          amount: { type: "number" },
          raw: { type: "string" },
        },
        required: ["amount", "raw"],
      },
      rentReview: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: [
              "fixed_percent",
              "fixed_amount",
              "cpi",
              "market",
              "greater_of",
              "ratchet",
              "other",
            ],
          },
          description: { type: "string" },
          frequency: { type: "string" },
          ratchetPresent: { type: "boolean" },
        },
        required: ["method", "description", "ratchetPresent"],
      },
      outgoingsPayable: { type: "boolean" },
      outgoingsDescription: { type: "string" },
      bankGuarantee: {
        type: "object",
        properties: {
          amount: { type: "number" },
          raw: { type: "string" },
        },
        required: ["amount", "raw"],
      },
      personalGuarantee: { type: "boolean" },
      personalGuarantorNames: { type: "array", items: { type: "string" } },
      makeGoodDescription: { type: "string" },
      liquorLicenceRequired: { type: "boolean" },
    },
    required: [
      "premisesAddress",
      "parties",
      "permittedUse",
      "termDescription",
      "outgoingsPayable",
      "personalGuarantee",
    ],
  },
};

const MAKE_GOOD_TOOL: Anthropic.Tool = {
  name: "record_make_good",
  description: "Record the make-good / reinstatement obligation. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      present: { type: "boolean" },
      severityRating: {
        type: "string",
        enum: ["light", "moderate", "heavy", "bare_shell"],
      },
      quotedText: { type: "string" },
      concerns: { type: "array", items: { type: "string" } },
      proposedAmendment: { type: "string" },
      costRiskNote: { type: "string" },
    },
    required: ["present"],
  },
};

const OUTGOINGS_TOOL: Anthropic.Tool = {
  name: "record_outgoings",
  description: "Record the outgoings payable by the tenant. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      payable: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            standard: { type: "boolean" },
            concern: { type: "string" },
          },
          required: ["item", "standard"],
        },
      },
      capPresent: { type: "boolean" },
      excessiveItems: { type: "array", items: { type: "string" } },
      proposedAmendment: { type: "string" },
    },
    required: ["payable", "capPresent"],
  },
};

const ONGOING_TOOL: Anthropic.Tool = {
  name: "record_ongoing_obligations",
  description:
    "Record ongoing financial obligations on the tenant that extend during and/or AFTER the lease (e.g. holdover rent at 150%, post-expiry make-good costs, indemnities surviving termination, continuing guarantees, ESM compliance obligations). Call exactly once. PRJ-693 capability 6: explicitly mark obligations whose cost is unquantified or determined at the landlord's discretion.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            durationNote: { type: "string" },
            severity: {
              type: "string",
              enum: ["info", "low", "medium", "high", "critical"],
            },
            quantified: {
              type: "boolean",
              description:
                "False if the cost is open-ended, uncapped, or determined at the landlord's discretion (e.g. 'such amount as the landlord reasonably determines'). True only if the lease specifies a fixed amount, a clear formula, or a hard cap.",
            },
            triggerCondition: {
              type: "string",
              description:
                "What triggers the obligation — e.g. 'on receipt of an ESM defect notice', 'on assignment', 'each year on review date'.",
            },
            costCeilingAud: {
              type: "number",
              description:
                "Cap on the tenant's exposure for this obligation in AUD. Omit if uncapped or unquantified.",
            },
          },
          required: [
            "description",
            "durationNote",
            "severity",
            "quantified",
          ],
        },
      },
    },
    required: ["items"],
  },
};

const EXTRACT_PROMPT = `You are assisting a Victorian property lawyer review a commercial lease against the 2023 LIV standard form lease as the baseline.

You have been given the uploaded lease PDF(s). Your job: call EVERY extraction tool below exactly once.

Tools:
1. record_lease_items — parties, premises, term, rent, reviews, options, security, outgoings, make-good
2. record_make_good — the make-good / reinstatement obligation (heavy ones are a key tenant risk)
3. record_outgoings — outgoings payable, itemised; flag anything beyond standard LIV 2023 outgoings
4. record_ongoing_obligations — any obligation that continues DURING or AFTER the lease term (key tenant risk focus). For each, set quantified=false if the cost is open-ended or landlord-discretion; set costCeilingAud only when an actual cap is stated. ESM (essential safety measure) obligations are almost always unquantified — flag them.

Rules:
- Quote verbatim in 'raw' / 'quotedText' / 'description' fields. Do not paraphrase monetary amounts or make-good clauses.
- Outgoings: mark 'standard: false' for anything NOT in the standard LIV 2023 outgoings list (e.g. landlord's capital costs, land tax on single-holding basis, management fees paid to related entity, sinking fund contributions).
- Make-good severity:
  - light: fair wear and tear excepted, paint & clean
  - moderate: full repaint + recarpet + remove tenant fit-out
  - heavy: remove all tenant fit-out + reinstate to original condition
  - bare_shell: strip back to base building / warm shell (HIGH RISK — often five-six figure cost)
- Rent review: set ratchetPresent=true if the clause prevents the rent from decreasing on market review.`;

export async function extractLeaseBundle(
  uploads: UploadedDocument[],
): Promise<{
  items: LeaseItems;
  makeGood: MakeGoodAssessment;
  outgoings: OutgoingsAssessment;
  ongoingObligations: OngoingFinancialObligations;
}> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: EXTRACT_PROMPT });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 16000,
    tools: [ITEMS_TOOL, MAKE_GOOD_TOOL, OUTGOINGS_TOOL, ONGOING_TOOL],
    tool_choice: { type: "any", disable_parallel_tool_use: false },
    messages: [{ role: "user", content }],
  });

  const byTool = new Map<string, unknown>();
  for (const block of res.content) {
    if (block.type === "tool_use") byTool.set(block.name, block.input);
  }
  const getTool = <T>(name: string): T => {
    const v = byTool.get(name);
    if (!v) throw new Error(`lease pass2: tool '${name}' not called`);
    return v as T;
  };

  const itemsRaw = getTool<Record<string, unknown>>("record_lease_items");
  const items = LeaseItemsSchema.parse({
    ...itemsRaw,
    optionTerms: (itemsRaw.optionTerms as string[] | undefined) ?? [],
    personalGuarantorNames:
      (itemsRaw.personalGuarantorNames as string[] | undefined) ?? [],
    commencingRent: itemsRaw.commencingRent
      ? { ...(itemsRaw.commencingRent as object), currency: "AUD" }
      : undefined,
    bankGuarantee: itemsRaw.bankGuarantee
      ? { ...(itemsRaw.bankGuarantee as object), currency: "AUD" }
      : undefined,
  });

  const makeGood = MakeGoodAssessmentSchema.parse(
    getTool<object>("record_make_good"),
  );
  const outgoingsRaw = getTool<Record<string, unknown>>("record_outgoings");
  const outgoings = OutgoingsAssessmentSchema.parse({
    ...outgoingsRaw,
    items: (outgoingsRaw.items as unknown[] | undefined) ?? [],
    excessiveItems:
      (outgoingsRaw.excessiveItems as string[] | undefined) ?? [],
  });
  const ongoingRaw = getTool<Record<string, unknown>>(
    "record_ongoing_obligations",
  );
  const ongoingObligations = OngoingFinancialObligationsSchema.parse({
    items: (ongoingRaw.items as unknown[] | undefined) ?? [],
  });

  return { items, makeGood, outgoings, ongoingObligations };
}
