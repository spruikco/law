import type Anthropic from "@anthropic-ai/sdk";
import {
  FacilityParticularsSchema,
  GuaranteeAssessmentSchema,
  DefaultAndEnforcementSchema,
  NccDisclosureChecklistSchema,
  PpsaAssessmentSchema,
  type FacilityParticulars,
  type GuaranteeAssessment,
  type DefaultAndEnforcement,
  type NccDisclosureChecklist,
  type PpsaAssessment,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import type { UploadedDocument } from "./types";

const PARTICULARS_TOOL: Anthropic.Tool = {
  name: "record_facility_particulars",
  description:
    "Record the facility particulars: parties, amount, kind, interest rate, repayment, securities, fees. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      parties: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: [
                "borrower",
                "lender",
                "guarantor",
                "mortgagor",
                "mortgagee",
                "grantor",
                "secured_party",
                "broker",
                "trustee",
                "beneficiary",
                "other",
              ],
            },
            name: { type: "string" },
            acn_or_abn: { type: "string" },
            address: { type: "string" },
            capacityNote: { type: "string" },
          },
          required: ["role", "name"],
        },
      },
      borrowerName: { type: "string" },
      lenderName: { type: "string" },
      facilityAmount: {
        type: "object",
        properties: { amount: { type: "number" }, raw: { type: "string" } },
        required: ["amount", "raw"],
      },
      facilityKind: {
        type: "string",
        enum: [
          "term_loan",
          "interest_only",
          "revolving",
          "overdraft",
          "construction",
          "bill_facility",
          "asset_finance",
          "guarantee_facility",
          "unknown",
        ],
      },
      drawdownConditions: { type: "array", items: { type: "string" } },
      purpose: { type: "string" },
      interestRate: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["fixed", "variable", "split", "introductory", "stepped", "other"],
          },
          initialRatePct: { type: "number" },
          comparisonRatePct: { type: "number" },
          description: { type: "string" },
          fixedPeriodMonths: { type: "number" },
          defaultRatePct: { type: "number" },
          resetMechanism: { type: "string" },
        },
        required: ["type", "description"],
      },
      repayment: {
        type: "object",
        properties: {
          description: { type: "string" },
          frequency: {
            type: "string",
            enum: [
              "weekly",
              "fortnightly",
              "monthly",
              "quarterly",
              "annually",
              "bullet",
              "other",
            ],
          },
          installmentAmount: {
            type: "object",
            properties: { amount: { type: "number" }, raw: { type: "string" } },
            required: ["amount", "raw"],
          },
          termMonths: { type: "number" },
          interestOnlyMonths: { type: "number" },
          balloonAtMaturity: {
            type: "object",
            properties: { amount: { type: "number" }, raw: { type: "string" } },
            required: ["amount", "raw"],
          },
        },
        required: ["description"],
      },
      securities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "real_property",
                "specific_personal_property",
                "all_present_and_after_acquired_property",
                "circulating_assets",
                "shares",
                "deposit",
                "directors_guarantee",
                "spouse_guarantee",
                "third_party_guarantee",
                "other",
              ],
            },
            description: { type: "string" },
            detail: { type: "string" },
            capAmount: {
              type: "object",
              properties: { amount: { type: "number" }, raw: { type: "string" } },
              required: ["amount", "raw"],
            },
            crossCollateralised: { type: "boolean" },
          },
          required: ["kind", "description"],
        },
      },
      fees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            amount: {
              type: "object",
              properties: { amount: { type: "number" }, raw: { type: "string" } },
              required: ["amount", "raw"],
            },
            formula: { type: "string" },
            trigger: {
              type: "string",
              enum: [
                "establishment",
                "drawdown",
                "ongoing",
                "early_repayment",
                "default",
                "discharge",
                "valuation",
                "other",
              ],
            },
            payableBy: {
              type: "string",
              enum: ["borrower", "guarantor", "either"],
            },
          },
          required: ["description", "trigger"],
        },
      },
      reviewEvents: { type: "array", items: { type: "string" } },
      earlyRepaymentDescription: { type: "string" },
      defaultDescription: { type: "string" },
      governingLaw: { type: "string" },
    },
    required: ["parties"],
  },
};

const GUARANTEE_TOOL: Anthropic.Tool = {
  name: "record_guarantee_assessment",
  description: "Record the guarantee assessment. Call exactly once even if no guarantee is present.",
  input_schema: {
    type: "object",
    properties: {
      present: { type: "boolean" },
      guarantors: { type: "array", items: { type: "string" } },
      isThirdPartyConsumerGuarantor: { type: "boolean" },
      capped: { type: "boolean" },
      capAmount: {
        type: "object",
        properties: { amount: { type: "number" }, raw: { type: "string" } },
        required: ["amount", "raw"],
      },
      principalDebtorClause: { type: "boolean" },
      independentLegalAdviceRequired: { type: "boolean" },
      ilaCertificateAttached: { type: "boolean" },
      codeOfBankingPracticeIssues: { type: "array", items: { type: "string" } },
      garciaRiskFlags: { type: "array", items: { type: "string" } },
      proposedAmendment: { type: "string" },
    },
    required: [
      "present",
      "isThirdPartyConsumerGuarantor",
      "capped",
      "principalDebtorClause",
      "independentLegalAdviceRequired",
    ],
  },
};

const DEFAULT_TOOL: Anthropic.Tool = {
  name: "record_default_and_enforcement",
  description: "Record events of default, notice mechanism, self-help clauses. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      defaultEvents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            graceDays: { type: ["number", "null"] },
            noticeRequired: { type: "boolean" },
            curePeriodDays: { type: ["number", "null"] },
            triggersAcceleration: { type: "boolean" },
            isCrossDefault: { type: "boolean" },
          },
          required: ["description", "noticeRequired", "triggersAcceleration"],
        },
      },
      noticeMechanism: { type: "string" },
      s88NoticeRecognised: { type: "boolean" },
      selfHelpClauses: { type: "array", items: { type: "string" } },
      receiverIndemnity: { type: "boolean" },
    },
    required: [],
  },
};

const NCC_TOOL: Anthropic.Tool = {
  name: "record_ncc_checklist",
  description:
    "Record the NCC s 17 disclosure checklist. Only call if classification.isConsumerCredit is true; if not, do not call this tool.",
  input_schema: {
    type: "object",
    properties: {
      preContractDisclosureProvided: { type: "boolean" },
      cashPriceDisclosed: { type: "boolean" },
      amountFinancedDisclosed: { type: "boolean" },
      annualPercentageRateDisclosed: { type: "boolean" },
      comparisonRateDisclosed: { type: "boolean" },
      feesAndChargesItemised: { type: "boolean" },
      defaultRateDisclosed: { type: "boolean" },
      hardshipNoticeIncluded: { type: "boolean" },
      cancellationRightsDisclosed: { type: "boolean" },
      warningsAndCoolingOffDisclosed: { type: "boolean" },
      notes: { type: "array", items: { type: "string" } },
    },
    required: [
      "preContractDisclosureProvided",
      "cashPriceDisclosed",
      "amountFinancedDisclosed",
      "annualPercentageRateDisclosed",
      "comparisonRateDisclosed",
      "feesAndChargesItemised",
      "defaultRateDisclosed",
      "hardshipNoticeIncluded",
      "cancellationRightsDisclosed",
      "warningsAndCoolingOffDisclosed",
    ],
  },
};

const PPSA_TOOL: Anthropic.Tool = {
  name: "record_ppsa_assessment",
  description: "Record the PPSA assessment for any GSA / charge over personal property. Call exactly once if any personal-property security is granted; otherwise do not call.",
  input_schema: {
    type: "object",
    properties: {
      applies: { type: "boolean" },
      collateralClasses: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "all_present_and_after_acquired_property",
            "all_present_and_after_acquired_property_excepting",
            "specific_personal_property",
            "circulating_assets",
            "non_circulating_assets",
            "motor_vehicles",
            "shares_and_securities",
            "intellectual_property",
            "other",
          ],
        },
      },
      attachmentRequirements: { type: "array", items: { type: "string" } },
      perfectionRequirements: { type: "array", items: { type: "string" } },
      taking_free_riskNotes: { type: "array", items: { type: "string" } },
      vestingRiskOnInsolvency: { type: "boolean" },
      registrationDescription: { type: "string" },
    },
    required: ["applies", "vestingRiskOnInsolvency"],
  },
};

const EXTRACT_PROMPT = `You are extracting structured data from a set of bank documents (mortgage, loan agreement, letter of offer, guarantee, GSA).

Call EVERY relevant tool below — at minimum, record_facility_particulars, record_guarantee_assessment, and record_default_and_enforcement. Call record_ncc_checklist iff this is consumer credit. Call record_ppsa_assessment iff there is a security interest over personal property.

Tools:
1. record_facility_particulars — parties, amount, kind, interest, repayment, securities, fees
2. record_guarantee_assessment — guarantors, cap, principal-debtor clause, ILA requirement, Code of Banking Practice cl 31 issues, Garcia volunteer-guarantor risk flags
3. record_default_and_enforcement — events of default, notice mechanism, self-help clauses
4. record_ncc_checklist — s 17 disclosure checklist (consumer credit only)
5. record_ppsa_assessment — collateral classes, perfection, vesting risk (security over personal property only)

Rules:
- Quote verbatim in 'description' / 'raw' fields. Do not paraphrase monetary amounts or interest formulae.
- Garcia risk flags: list every fact pattern detected (volunteer guarantor, spousal/parental relationship, no benefit, no ILA, signed at lender's office, urgency).
- Self-help clauses: list any clause permitting entry, sale, set-off, or appointment of receiver without notice or court order.`;

export async function extractBankDocsBundle(
  uploads: UploadedDocument[],
): Promise<{
  particulars: FacilityParticulars;
  guarantee: GuaranteeAssessment;
  defaultAndEnforcement: DefaultAndEnforcement;
  nccChecklist?: NccDisclosureChecklist;
  ppsa?: PpsaAssessment;
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
    tools: [PARTICULARS_TOOL, GUARANTEE_TOOL, DEFAULT_TOOL, NCC_TOOL, PPSA_TOOL],
    tool_choice: { type: "any", disable_parallel_tool_use: false },
    messages: [{ role: "user", content }],
  });

  const byTool = new Map<string, unknown>();
  for (const block of res.content) {
    if (block.type === "tool_use") byTool.set(block.name, block.input);
  }
  const getTool = <T>(name: string, optional = false): T | undefined => {
    const v = byTool.get(name);
    if (!v) {
      if (optional) return undefined;
      throw new Error(`bank-docs pass2: tool '${name}' not called`);
    }
    return v as T;
  };

  const partRaw = getTool<Record<string, unknown>>("record_facility_particulars")!;
  const particulars = FacilityParticularsSchema.parse({
    ...partRaw,
    drawdownConditions: (partRaw.drawdownConditions as string[] | undefined) ?? [],
    securities: ((partRaw.securities as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
      ...s,
      capAmount: s.capAmount ? { ...(s.capAmount as object), currency: "AUD" } : undefined,
      crossCollateralised: s.crossCollateralised ?? false,
    })),
    fees: ((partRaw.fees as Record<string, unknown>[] | undefined) ?? []).map((f) => ({
      ...f,
      amount: f.amount ? { ...(f.amount as object), currency: "AUD" } : undefined,
    })),
    reviewEvents: (partRaw.reviewEvents as string[] | undefined) ?? [],
    facilityAmount: partRaw.facilityAmount
      ? { ...(partRaw.facilityAmount as object), currency: "AUD" }
      : undefined,
    interestRate: partRaw.interestRate as object | undefined,
    repayment: partRaw.repayment
      ? {
          ...(partRaw.repayment as Record<string, unknown>),
          installmentAmount: (partRaw.repayment as { installmentAmount?: object }).installmentAmount
            ? {
                ...((partRaw.repayment as { installmentAmount?: object }).installmentAmount as object),
                currency: "AUD",
              }
            : undefined,
          balloonAtMaturity: (partRaw.repayment as { balloonAtMaturity?: object }).balloonAtMaturity
            ? {
                ...((partRaw.repayment as { balloonAtMaturity?: object }).balloonAtMaturity as object),
                currency: "AUD",
              }
            : undefined,
        }
      : undefined,
  });

  const guarRaw = getTool<Record<string, unknown>>("record_guarantee_assessment")!;
  const guarantee = GuaranteeAssessmentSchema.parse({
    ...guarRaw,
    guarantors: (guarRaw.guarantors as string[] | undefined) ?? [],
    codeOfBankingPracticeIssues:
      (guarRaw.codeOfBankingPracticeIssues as string[] | undefined) ?? [],
    garciaRiskFlags: (guarRaw.garciaRiskFlags as string[] | undefined) ?? [],
    capAmount: guarRaw.capAmount
      ? { ...(guarRaw.capAmount as object), currency: "AUD" }
      : undefined,
  });

  const defRaw = getTool<Record<string, unknown>>("record_default_and_enforcement", true);
  const defaultAndEnforcement = DefaultAndEnforcementSchema.parse({
    ...(defRaw ?? {}),
    defaultEvents: ((defRaw?.defaultEvents as Record<string, unknown>[] | undefined) ?? []).map((d) => ({
      ...d,
      graceDays: d.graceDays ?? null,
      curePeriodDays: d.curePeriodDays ?? null,
      isCrossDefault: d.isCrossDefault ?? false,
    })),
    selfHelpClauses: (defRaw?.selfHelpClauses as string[] | undefined) ?? [],
  });

  const nccRaw = getTool<Record<string, unknown>>("record_ncc_checklist", true);
  const nccChecklist = nccRaw
    ? NccDisclosureChecklistSchema.parse({
        ...nccRaw,
        notes: (nccRaw.notes as string[] | undefined) ?? [],
      })
    : undefined;

  const ppsaRaw = getTool<Record<string, unknown>>("record_ppsa_assessment", true);
  const ppsa = ppsaRaw
    ? PpsaAssessmentSchema.parse({
        ...ppsaRaw,
        collateralClasses: (ppsaRaw.collateralClasses as string[] | undefined) ?? [],
        attachmentRequirements: (ppsaRaw.attachmentRequirements as string[] | undefined) ?? [],
        perfectionRequirements: (ppsaRaw.perfectionRequirements as string[] | undefined) ?? [],
        taking_free_riskNotes: (ppsaRaw.taking_free_riskNotes as string[] | undefined) ?? [],
      })
    : undefined;

  return { particulars, guarantee, defaultAndEnforcement, nccChecklist, ppsa };
}
