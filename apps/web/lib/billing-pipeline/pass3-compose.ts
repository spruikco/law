import {
  BillingDocumentSchema,
  type BillingDocument,
  type BillingFinding,
  type BillingInput,
  type BillingTotals,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "header", heading: "Header" },
  { id: "tax_invoice", heading: "Tax Invoice" },
  { id: "fee_summary", heading: "Summary of professional fees" },
  { id: "fee_items", heading: "Professional fees — itemised" },
  { id: "disbursements", heading: "Disbursements" },
  { id: "uplift", heading: "Conditional uplift" },
  { id: "totals", heading: "Totals" },
  { id: "trust_application", heading: "Trust money application" },
  { id: "interest_notice", heading: "Interest on overdue costs" },
  { id: "client_rights_notice", heading: "Notice of your rights" },
  { id: "payment_instructions", heading: "Payment instructions" },
  { id: "signature_block", heading: "Signature" },
] as const;

const SYSTEM_PROMPT = `You are drafting a legal-costs bill under LPUL Pt 4.3 (Vic).
The supervising solicitor will review and sign before sending. You MUST:

- Use a professional Australian solicitor-to-client tone — formal, neutral.
- Output GitHub-flavoured Markdown with H2 headings (##), tables for itemised
  fees and disbursements, **bold** for emphasis.
- Cite the LPUL Application Act 2014 (Vic) sections inline (s 172 / s 174 /
  s 182 / s 186 / s 187 / s 192 / s 193 / s 195 / Pt 5.4) where relevant.
- Comply with GST Act s 29-70 form requirements: label "Tax Invoice",
  show supplier ABN, recipient name, GST amount.
- For an "itemised_on_request" or "memorandum_of_costs" bill, include a
  full table: date | fee earner | description | units | rate | amount.
- For a "final" or "interim_progress" bill, the fee_items section may show
  a summary by phase or top entries plus the s 187 right to request itemised.
- Always include a "Notice of your rights" section covering itemised bill
  on request (s 187 — 30 days), costs assessment (Pt 5.4), and VLSB+C complaint.
- Only include the "Conditional uplift" section if isConditional + upliftAppliedToFees.
- Only include the "Trust money application" section if willWithdrawFromTrust.
- Only include the "Interest on overdue costs" section if interestPercent is set.
- Never assert that the bill IS payable — say it IS DUE on the due date and
  invite the client to query within 30 days.`;

const buildItemsTable = (input: BillingInput): string => {
  if (input.feeItems.length === 0) return "_No fee items recorded._";
  const rows = input.feeItems
    .map(
      (l) =>
        `| ${l.date} | ${l.feeEarner} | ${l.description.replace(/\|/g, "\\|")} | ${l.units} | $${l.rate.amount.toFixed(2)} | $${l.amount.amount.toFixed(2)} |`,
    )
    .join("\n");
  return `| Date | Fee earner | Description | Units | Rate | Amount |\n|---|---|---|---|---|---|\n${rows}`;
};

const buildDisbTable = (input: BillingInput): string => {
  if (input.disbursements.length === 0) return "_No disbursements._";
  const rows = input.disbursements
    .map(
      (d) =>
        `| ${d.date} | ${d.description.replace(/\|/g, "\\|")} | $${d.amount.amount.toFixed(2)} | ${d.gstApplicable ? "yes" : "no"} | ${d.paidFromTrust ? "yes" : "no"} |`,
    )
    .join("\n");
  return `| Date | Description | Amount | GST | Paid from trust |\n|---|---|---|---|---|\n${rows}`;
};

const USER_TEMPLATE = (
  input: BillingInput,
  totals: BillingTotals,
  today: string,
): string => `Draft a compliant LPUL Pt 4.3 bill for the following matter.

Today: ${today}

Practice:
${JSON.stringify(input.practice, null, 2)}

Client:
${JSON.stringify(input.client, null, 2)}

Bill kind: ${input.billKind}
Bill number: ${input.billNumber}
Matter ref: ${input.matterRef}
Matter description: ${input.matterDescription}
Period: ${input.periodStart} to ${input.periodEnd}
Issued: ${input.issuedOn}
Due: ${input.dueOn}

Costs agreement on file: ${input.costsAgreementOnFile}
Costs disclosure given on: ${input.costsDisclosureGivenAt ?? "(not recorded)"}
Conditional CCA: ${input.isConditional}${input.upliftPercent != null ? ` · uplift ${input.upliftPercent}%` : ""}
Uplift applied to fees in this bill: ${input.upliftAppliedToFees}
Sophisticated client (s 174(4)): ${input.isSophisticatedClient}
Signing solicitor: ${input.signingSolicitorName}
Trust withdrawal: ${input.willWithdrawFromTrust}${input.trustBalance ? ` · trust balance $${input.trustBalance.amount}` : ""}
Interest: ${input.interestPercent != null ? `${input.interestPercent}% pa` : "none"} · agreement permits: ${input.interestClauseInAgreement}

Computed totals (use these EXACT amounts):
- Fees subtotal: $${totals.feesSubtotal.amount.toFixed(2)}
${totals.upliftAmount ? `- Uplift: $${totals.upliftAmount.amount.toFixed(2)}\n` : ""}- Disbursements (GST applicable): $${totals.disbursementsGstable.amount.toFixed(2)}
- Disbursements (no GST): $${totals.disbursementsNonGstable.amount.toFixed(2)}
- Subtotal (ex GST): $${totals.subtotalExGst.amount.toFixed(2)}
- GST: $${totals.gst.amount.toFixed(2)}
- Total (inc GST): $${totals.totalIncGst.amount.toFixed(2)}
${totals.trustOffset ? `- Less trust offset: -$${totals.trustOffset.amount.toFixed(2)}\n` : ""}${totals.priorPaid ? `- Less prior paid: -$${totals.priorPaid.amount.toFixed(2)}\n` : ""}- Amount now due: $${totals.amountDue.amount.toFixed(2)}

Fee items table:
${buildItemsTable(input)}

Disbursements table:
${buildDisbTable(input)}

Prior bills:
${
  input.priorBills.length === 0
    ? "(none)"
    : input.priorBills
        .map(
          (p) =>
            `- ${p.number} (issued ${p.issuedOn}): total $${p.total.amount.toFixed(2)}, paid $${p.paid.amount.toFixed(2)}`,
        )
        .join("\n")
}

Payment instructions: ${input.paymentInstructions ?? "(use practice bank details if provided)"}
Matter notes: ${input.matterNotes ?? "(none)"}

Sections (use these EXACT H2 headings):

1. **Header** — practice letterhead block, addressed to client, our reference, the matter title, date.
2. **Tax Invoice** — explicitly labelled "Tax Invoice"; show supplier name + ABN, bill number, issued date, due date, recipient (client) name + address, summary line.
3. **Summary of professional fees** — narrative describing the work done in the bill period. Plain English summary, not itemised.
4. **Professional fees — itemised** — for "itemised_on_request" or "memorandum_of_costs" reproduce the full table above. For "interim_progress" / "final" show the table OR a phase summary + a paragraph noting the right to request itemised under s 187.
5. **Disbursements** — reproduce the disbursements table; note GST treatment.
6. **Conditional uplift** — only if isConditional AND upliftAppliedToFees. Show the uplift calculation, cite s 182, confirm cap not exceeded.
7. **Totals** — itemised totals as above; bold the "Amount now due".
8. **Trust money application** — only if willWithdrawFromTrust. State that, in accordance with s 150 and s 152, the practice will withdraw the trust offset above on the seventh business day after this bill is given unless the client objects. Cite the right to object.
9. **Interest on overdue costs** — only if interestPercent set. Cite s 193, confirm the costs agreement permits interest, state the rate and that it begins 30 days after the bill is given.
10. **Notice of your rights** — MANDATORY. Cover: right to request an itemised bill within 30 days under s 187 (delivered within 21 days); right to apply for costs assessment under Pt 5.4 within 12 months; right to make a complaint to VLSB+C; right to negotiate the costs agreement. Plain language.
11. **Payment instructions** — bank details if provided; payment reference (use bill number).
12. **Signature** — block for the signing solicitor (s 186) — name, role, date.

Omit sections marked "only if ..." when the condition is false. Begin each
section with a Markdown H2 heading exactly matching the heading above.`;

export async function composeBillingDocument(args: {
  input: BillingInput;
  totals: BillingTotals;
  findings: BillingFinding[];
  onChunk?: (text: string) => void;
}): Promise<BillingDocument> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const userMessage =
    USER_TEMPLATE(args.input, args.totals, today) +
    `\n\nCompliance checker results (consider when drafting):\n${JSON.stringify(args.findings, null, 2)}`;

  const stream = anthropic.messages.stream({
    model: Models.Opus,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      args.onChunk?.(event.delta.text);
    }
  }

  const sections: BillingDocument["sections"] = [];
  const lines = full.split(/\r?\n/);
  let currentHeading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentHeading === null) return;
    const def = SECTION_DEFS.find(
      (d) => {
        const norm = currentHeading!.trim().toLowerCase();
        const h = d.heading.toLowerCase();
        return norm === h || norm.startsWith(h + " ") || norm.startsWith(h + " —") || norm.startsWith(h + " -");
      },
    );
    if (!def) return;
    sections.push({ id: def.id, heading: def.heading, markdown: buf.join("\n").trim() });
  };
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      flush();
      currentHeading = h[1];
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();

  return BillingDocumentSchema.parse({ date: today, sections });
}
