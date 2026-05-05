import {
  CostDisclosureLetterSchema,
  type CostDisclosureFinding,
  type CostDisclosureInput,
  type CostDisclosureLetter,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "header", heading: "Header" },
  { id: "matter_description", heading: "Your matter" },
  { id: "fee_basis", heading: "How our fees are calculated" },
  { id: "estimate", heading: "Estimated total legal costs" },
  { id: "hourly_rates", heading: "Hourly rates" },
  { id: "disbursements", heading: "Anticipated disbursements" },
  { id: "billing_and_payment", heading: "Billing and payment" },
  { id: "conditional_costs_uplift", heading: "Conditional costs and uplift fee" },
  { id: "client_rights", heading: "Your rights as a client" },
  { id: "dispute_resolution", heading: "Costs disputes" },
  { id: "assumptions_and_risks", heading: "Assumptions and risks" },
  { id: "acceptance_block", heading: "Your acceptance" },
] as const;

const SYSTEM_PROMPT = `You are drafting a cost disclosure under LPUL s 174 (Vic).
The supervising solicitor will review and sign before sending. You MUST:

- Use a professional Australian legal letter tone — solicitor-to-client.
- Cite the LPUL Application Act 2014 (Vic) sections inline (s 174 / s 178 / s 181 /
  s 182 / s 187 / s 198 / Pt 5.4) where relevant.
- Output Markdown with H2 headings (##), lists, **bold**.
- Never make statements that could be construed as a promise of outcome.
- Cover ALL mandatory s 174 elements — basis of fees, estimate, progress information,
  bill / itemised bill rights, VLSB+C dispute avenues, conditional / uplift disclosures
  where applicable.
- Do NOT exceed a 25% uplift cap (s 182).
- Disclose the right to a costs assessment under Pt 5.4.`;

const USER_TEMPLATE = (input: CostDisclosureInput, today: string) => `Draft a compliant
LPUL s 174 cost disclosure letter for the following matter.

Date: ${today}

Practice:
${JSON.stringify(input.practice, null, 2)}

Client:
${JSON.stringify(input.client, null, 2)}

Matter:
- type: ${input.matterType}
- description: ${input.matterDescription}

Fee basis: ${input.feeBasis}
Estimate: ${
  input.estimatedTotal
    ? `$${input.estimatedTotal.amount} ${input.estimatedTotal.currency}`
    : input.estimateRange
      ? `$${input.estimateRange.low.amount}-$${input.estimateRange.high.amount} ${input.estimateRange.low.currency}`
      : input.fixedFeeAmount
        ? `fixed $${input.fixedFeeAmount.amount} ${input.fixedFeeAmount.currency}`
        : "(not provided — flag this)"
}
Hourly rates: ${
  input.hourlyRates.length > 0
    ? input.hourlyRates.map((r) => `${r.role} $${r.rate.amount}/hr`).join(", ")
    : "(none)"
}
Disbursements: ${input.disbursementsAnticipated.join("; ") || "(none stated)"}
Billing frequency: ${input.billingFrequency}
Payment terms: ${input.paymentTerms}
Conditional? ${input.isConditional}${input.upliftPercent != null ? ` · uplift ${input.upliftPercent}%` : ""}
Sophisticated client (s 174(4))? ${input.isSophisticatedClient}
Assumptions:
${input.matterAssumptions.map((a) => `- ${a}`).join("\n") || "(none)"}
Risks:
${input.matterRisks.map((r) => `- ${r}`).join("\n") || "(none)"}
Note to client: ${input.noteToClient ?? "(none)"}

Sections (use these EXACT H2 headings):

1. **Header** — addressed to client, our reference, the matter title, date.
2. **Your matter** — restate the matter description and scope.
3. **How our fees are calculated** — explain the fee basis. For "hourly", mention rounding
   convention (e.g. 6-minute units). For "fixed", state inclusions and exclusions.
4. **Estimated total legal costs** — state the estimate; flag that the estimate may change
   and we will update you under s 174(3) if there is a substantial change.
5. **Hourly rates** — only if hourly / blended.
6. **Anticipated disbursements** — list and note GST treatment.
7. **Billing and payment** — billing frequency + payment terms; right to receive a bill;
   right to request an itemised bill within 30 days of a lump-sum bill (s 187).
8. **Conditional costs and uplift fee** — only if isConditional is true. Cover the s 181
   formal requirements, the 5-business-day cooling-off, and the s 182 uplift cap of 25%.
9. **Your rights as a client** — progress reports, substantial-change notification, right
   to negotiate a costs agreement, right to accept / reject any settlement offer, right
   to seek VLSB+C assistance.
10. **Costs disputes** — VLSB+C and Pt 5.4 costs assessment.
11. **Assumptions and risks** — only if listed.
12. **Your acceptance** — signature block (Solicitor / Client / Date).

Omit sections whose input is empty (except 1, 2, 3, 4, 7, 9, 10, 12 which are mandatory).

Begin each section with a Markdown H2 heading exactly matching the heading above.`;

export async function composeCostDisclosure(args: {
  input: CostDisclosureInput;
  findings: CostDisclosureFinding[];
  onChunk?: (text: string) => void;
}): Promise<CostDisclosureLetter> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const userMessage =
    USER_TEMPLATE(args.input, today) +
    `\n\nCompliance checker results (consider when drafting):\n${JSON.stringify(args.findings, null, 2)}`;

  const stream = anthropic.messages.stream({
    model: Models.Opus,
    max_tokens: 12000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      args.onChunk?.(event.delta.text);
    }
  }

  const sections: CostDisclosureLetter["sections"] = [];
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

  return CostDisclosureLetterSchema.parse({ date: today, sections });
}
