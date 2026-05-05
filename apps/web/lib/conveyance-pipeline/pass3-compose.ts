import {
  SettlementDocumentSchema,
  type ConveyanceFinding,
  type SettlementCalculation,
  type SettlementDocument,
  type SettlementInput,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "header", heading: "Header" },
  { id: "matter_summary", heading: "Matter summary" },
  { id: "purchase_price", heading: "Purchase price" },
  { id: "adjustments", heading: "Settlement adjustments" },
  { id: "stamp_duty", heading: "Stamp duty" },
  { id: "totals", heading: "Total at settlement" },
  { id: "payment_directions", heading: "Payment directions" },
  { id: "post_settlement_checklist", heading: "Post-settlement checklist" },
  { id: "signoff", heading: "Sign-off" },
] as const;

const SYSTEM_PROMPT = `You are drafting a Victorian settlement statement and
post-settlement checklist for the supervising solicitor's review and sign-off.
You MUST:

- Use a professional Australian solicitor-to-client tone — formal, neutral.
- Output GitHub-flavoured Markdown with H2 headings (##), tables for the
  adjustments and stamp duty, **bold** for emphasis.
- Cite Sale of Land Act 1962 (Vic) (s 32 / s 27 / s 10G), Property Law Act 1958
  (Vic), Land Tax Act 2005 (Vic) s 96, Duties Act 2000 (Vic) (s 16 / s 17 /
  s 21 / s 28A / Pt 5 Div 4A), Owners Corporations Act 2006 (Vic) s 23,
  Transfer of Land Act 1958 (Vic) inline where relevant.
- The "Settlement adjustments" table MUST show every line: description,
  vendor days / purchaser days / total days, debit/credit (purchaser side),
  amount, and a citation column.
- The "Stamp duty" section MUST show the working: dutiable value, base duty,
  each applied concession with cite, foreign purchaser additional if any,
  total payable.
- The "Total at settlement" section MUST show: contract price, less deposit,
  plus net debits, less net credits = total payable at settlement.
- The "Payment directions" section MUST direct the funds — to the vendor's
  solicitor, to the discharging mortgagee (if applicable), to council /
  water authority for outstanding rates, to PEXA for duty + registration.
- The "Post-settlement checklist" MUST list: Notice of Acquisition (council,
  water, SRO), TLA registration of transfer, return original certificate of
  title, deal with deposit (if held in vendor's solicitor's trust account),
  client report letter.`;

const buildAdjTable = (calc: SettlementCalculation): string => {
  if (calc.adjustments.length === 0) return "_No adjustments._";
  const rows = calc.adjustments
    .map((a) => {
      const days =
        a.daysVendor != null && a.daysPurchaser != null && a.totalDays != null
          ? `${a.daysVendor}/${a.daysPurchaser}/${a.totalDays}`
          : "—";
      const cite =
        a.citations.length > 0
          ? a.citations
              .map((c) => `${c.act.replace(/\(Vic\)/, "").trim()} s ${c.section}`)
              .join("; ")
          : "—";
      return `| ${a.description.replace(/\|/g, "\\|")} | ${days} | ${a.side} | $${a.amount.amount.toFixed(2)} | ${cite} |`;
    })
    .join("\n");
  return `| Description | V/P/Total days | Side | Amount | Citation |\n|---|---|---|---|---|\n${rows}`;
};

const USER_TEMPLATE = (
  input: SettlementInput,
  calc: SettlementCalculation,
  today: string,
): string => `Draft a VIC settlement statement.

Today: ${today}

Practice (acting for the ${input.side}):
${JSON.stringify(input.practice, null, 2)}

Client:
${JSON.stringify(input.client, null, 2)}

Property: ${input.property.addressLine}, ${input.property.suburb} ${input.property.postcode}
${input.property.titleVolume ? `Title: Vol ${input.property.titleVolume} Fol ${input.property.titleFolio}` : ""}
${input.property.plan ? `Plan: ${input.property.plan}` : ""}
Owners corp lot: ${input.property.isOwnersCorpLot ? "yes" : "no"}

Vendor: ${input.vendor.name}
Purchaser: ${input.purchaser.name}
Contract date: ${input.contractDate}
Settlement date: ${input.settlementDate}
Adjustment date: ${input.adjustmentDate}
Contract price: $${input.contractPrice.amount.toFixed(2)}
Deposit paid: $${input.depositPaid.amount.toFixed(2)}
Going concern GST-free: ${input.isGoingConcernGstFree}
PEXA workspace: ${input.pexaWorkspaceId ?? "(not yet created)"}

Stamp duty inputs:
${JSON.stringify(input.stampDuty, null, 2)}

Calculation totals:
- Balance of purchase price: $${calc.balanceOfPurchasePrice.amount.toFixed(2)}
- Net debits to purchaser: $${calc.netDebits.amount.toFixed(2)}
- Net credits to purchaser (excl deposit): $${calc.netCredits.amount.toFixed(2)}
- Total at settlement: $${calc.totalAtSettlement.amount.toFixed(2)}
- Stamp duty payable: $${calc.stampDuty.totalDutyPayable.amount.toFixed(2)}

Adjustments table:
${buildAdjTable(calc)}

Stamp duty working:
- Dutiable value: $${calc.stampDuty.dutiableValue.amount.toFixed(2)}
- Base duty: $${calc.stampDuty.baseDuty.amount.toFixed(2)}
${calc.stampDuty.pprConcession ? `- PPR concession: -$${calc.stampDuty.pprConcession.amount.toFixed(2)}\n` : ""}${calc.stampDuty.fhbConcession ? `- FHB concession: -$${calc.stampDuty.fhbConcession.amount.toFixed(2)}\n` : ""}${calc.stampDuty.pensionerConcession ? `- Pensioner concession: -$${calc.stampDuty.pensionerConcession.amount.toFixed(2)}\n` : ""}${calc.stampDuty.foreignPurchaserAdditional ? `- Foreign purchaser additional: +$${calc.stampDuty.foreignPurchaserAdditional.amount.toFixed(2)}\n` : ""}- Total payable: $${calc.stampDuty.totalDutyPayable.amount.toFixed(2)}
Working notes:
${calc.stampDuty.workingNotes.map((n) => `- ${n}`).join("\n")}

Final notes from solicitor:
${input.finalNotes ?? "(none)"}

Sections (use these EXACT H2 headings):

1. **Header** — practice block, "Settlement Statement" title, date, our reference, the matter title.
2. **Matter summary** — property, parties, contract date, settlement date, adjustment date.
3. **Purchase price** — show contract price, less deposit, balance.
4. **Settlement adjustments** — reproduce the adjustments table; explain key adjustments. Cite legislation.
5. **Stamp duty** — reproduce the stamp duty working as a table; explain each concession. Cite Duties Act sections.
6. **Total at settlement** — final calculation: balance + debits − credits = total. Bold the total.
7. **Payment directions** — itemise where funds go (vendor's solicitor, discharging mortgagee, council/water for outstanding rates, PEXA for duty + registration). Use the contract price ÷ disbursements split.
8. **Post-settlement checklist** — Notice of Acquisition (council, water, SRO), TLA registration of transfer, deposit handling (s 27 if released early), original certificate of title, client report letter, file closing.
9. **Sign-off** — block for the supervising solicitor.

Begin each section with a Markdown H2 heading exactly matching the heading above.`;

export async function composeSettlementDocument(args: {
  input: SettlementInput;
  calc: SettlementCalculation;
  findings: ConveyanceFinding[];
  onChunk?: (text: string) => void;
}): Promise<SettlementDocument> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const userMessage =
    USER_TEMPLATE(args.input, args.calc, today) +
    `\n\nCompliance checker results:\n${JSON.stringify(args.findings, null, 2)}`;

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

  const sections: SettlementDocument["sections"] = [];
  const lines = full.split(/\r?\n/);
  let currentHeading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentHeading === null) return;
    const norm = currentHeading.trim().toLowerCase();
    // Tolerate trailing detail after the heading text, e.g. "## Header — Smith & Co"
    const def = SECTION_DEFS.find((d) => {
      const h = d.heading.toLowerCase();
      return norm === h || norm.startsWith(h + " ") || norm.startsWith(h + " —") || norm.startsWith(h + " -");
    });
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

  return SettlementDocumentSchema.parse({ date: today, sections });
}
