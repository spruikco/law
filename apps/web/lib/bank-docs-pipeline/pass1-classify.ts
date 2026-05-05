import type Anthropic from "@anthropic-ai/sdk";
import { BankDocClassificationSchema, type BankDocClassification } from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import { pdfBlock } from "../anthropic/pdf";
import { retrieve } from "../rag";
import type { UploadedDocument } from "./types";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_bank_docs",
  description:
    "Record the classification of the uploaded bank documents — kind, facility type, NCC applicability, ACL UCT regime applicability, third-party guarantee status. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "mortgage",
          "loan_agreement",
          "letter_of_offer",
          "guarantee",
          "general_security_agreement",
          "deed_of_priority",
          "deed_of_subordination",
          "specific_security_agreement",
          "indemnity",
          "other",
        ],
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
      isConsumerCredit: { type: "boolean" },
      nccBasis: { type: "string" },
      isUnfairContractTermsRegime: { type: "boolean" },
      isThirdPartyGuarantee: { type: "boolean" },
      jointAndSeveral: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
    },
    required: [
      "kind",
      "isConsumerCredit",
      "isUnfairContractTermsRegime",
      "isThirdPartyGuarantee",
      "jointAndSeveral",
      "confidence",
      "reasoning",
    ],
  },
};

export async function classifyBankDocs(
  uploads: UploadedDocument[],
): Promise<BankDocClassification> {
  let nccContext = "";
  try {
    const chunks = await retrieve(
      "National Credit Code section 5 application consumer credit predominant purpose",
      { limit: 4 },
    );
    if (chunks.length > 0) {
      nccContext =
        "\n\nRelevant NCC / ACL excerpts for grounding:\n" +
        chunks
          .map(
            (c) =>
              `[${c.act} s ${c.section}${c.subsection ? " " + c.subsection : ""}]\n${c.text}`,
          )
          .join("\n\n");
    }
  } catch {
    // corpus not ready
  }

  const prompt = `You are classifying uploaded bank documents (mortgage, loan agreement, letter of offer, guarantee, GSA, etc.).

Apply three independent tests:

1. **Document kind** — pick the dominant document type.
2. **National Credit Code (NCC) applies** — under NCC s 5: (a) debtor is a natural person or strata corp; (b) credit is provided wholly or predominantly for personal, domestic, household or residential-investment purposes; (c) a charge for credit is or may be made; (d) the lender provides the credit in the course of a credit business. Plus rule out s 6 exclusions (small business credit, short-term ≤ 62 days, employer credit). Set isConsumerCredit accordingly and explain in nccBasis.
3. **ACL Pt 2-3 unfair contract terms regime** — applies if (a) standard-form contract (s 27) AND (b) borrower (or guarantor) is a consumer (s 23(2)) OR small business (post Nov 2023: < 100 employees OR turnover < $10m). Set isUnfairContractTermsRegime accordingly.

Also report:
- isThirdPartyGuarantee — true if a non-borrower individual gives a guarantee. Triggers Code of Banking Practice cl 31 + Yerkey/Garcia equity.
- jointAndSeveral — true if multiple borrowers / guarantors are jointly and severally liable.
- confidence — 0..1.
- reasoning — 2-3 sentences.${nccContext}`;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const u of uploads) {
    content.push({ type: "text", text: `Uploaded file: ${u.filename}` });
    content.push(pdfBlock(u.bytes, u.filename));
  }
  content.push({ type: "text", text: prompt });

  const res = await anthropic.messages.create({
    model: Models.Sonnet,
    max_tokens: 2048,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_bank_docs" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("bank-docs pass1: model did not call classify_bank_docs");
  }
  return BankDocClassificationSchema.parse(toolUse.input);
}
