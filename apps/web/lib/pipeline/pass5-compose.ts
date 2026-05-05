import {
  LetterSchema,
  type ComplianceFinding,
  type ExtractionBundle,
  type Letter,
  type RiskFinding,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "summary", heading: "Summary of the transaction" },
  { id: "particulars", heading: "Particulars of sale" },
  { id: "conditions_precedent", heading: "Conditions precedent" },
  { id: "risky_special_conditions", heading: "Risky special conditions" },
  {
    id: "variations_to_general_conditions",
    heading: "Variations to general conditions",
  },
  {
    id: "missing_disclosures",
    heading: "Section 32 disclosures — compliance check",
  },
  { id: "owners_corp_red_flags", heading: "Owners Corporation — red flags" },
  { id: "tax_implications", heading: "Tax implications" },
  { id: "next_steps", heading: "Next steps" },
] as const;

const SYSTEM_PROMPT = `You are drafting a lawyer-reviewable letter of advice to a Victorian client on a property transaction. The property lawyer will review, edit, and sign off before sending. You MUST:

- Use a professional Australian legal letter tone — direct, lawyer-to-client.
- Never make statements that could be construed as the final legal advice of the reviewing lawyer. Use phrases like "we recommend you consider", "you should be aware", "subject to your lawyer's confirmation".
- Cite specific legislation inline in the form (Sale of Land Act 1962 (Vic) s 32C).
- Keep each section focused; don't duplicate information across sections.
- If a section has no content, say so briefly ("No conditions precedent were identified").
- Output must be valid Markdown — use headings (##), lists, and **bold** for emphasis.`;

const USER_TEMPLATE = (args: {
  extraction: ExtractionBundle;
  compliance: ComplianceFinding[];
  risks: RiskFinding[];
  clientName: string;
  today: string;
}) => `Client: ${args.clientName}
Property: ${args.extraction.particulars.propertyAddress}
Date: ${args.today}

Draft the letter of advice, section by section, using the headings listed below. For each section, I will tell you which data to focus on.

Sections (in order):

1. **Summary of the transaction** — price, deposit, parties, settlement. 1 paragraph.
2. **Particulars of sale** — concise bullet list of the particulars.
3. **Conditions precedent** — list each condition precedent from the risk findings; state what the purchaser must do and by when.
4. **Risky special conditions** — for each risky_special_condition finding: quote the SC number, summarise, state why it is risky, what mitigation/negotiation to consider.
5. **Variations to general conditions** — for each general_condition_variation: state the SC number, the GC it varies, the net effect, and impact on the purchaser.
6. **Section 32 disclosures — compliance check** — summarise compliance findings. Group passes briefly ("The following mandatory disclosures appear to be complied with: ..."). Then detail every fail / warning / needs_review with severity and citation.
7. **Owners Corporation — red flags** — if applicable, summarise OC findings. Otherwise say "The property is not affected by an Owners Corporation" or "No material OC red flags were identified."
8. **Tax implications** — land tax, windfall gains, commercial & industrial property tax reform, foreign purchaser duty, GST — whichever trigger in the findings.
9. **Next steps** — action checklist for the client (e.g. return executed contract, arrange inspections, satisfy finance condition by date X, etc.)

Input data:

### Extraction
${JSON.stringify(args.extraction, null, 2)}

### Compliance findings
${JSON.stringify(args.compliance, null, 2)}

### Risk findings
${JSON.stringify(args.risks, null, 2)}

Output format: begin each section with a Markdown H2 heading exactly matching the heading text above (e.g. "## Summary of the transaction"). Do not include a top-level title or footer — the template wraps the letter.`;

export async function composeLetter(args: {
  extraction: ExtractionBundle;
  compliance: ComplianceFinding[];
  risks: RiskFinding[];
  clientName: string;
  onChunk?: (text: string) => void;
}): Promise<Letter> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const stream = anthropic.messages.stream({
    model: Models.Opus,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: USER_TEMPLATE({
          extraction: args.extraction,
          compliance: args.compliance,
          risks: args.risks,
          clientName: args.clientName,
          today,
        }),
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      full += event.delta.text;
      args.onChunk?.(event.delta.text);
    }
  }

  // Split the full markdown by H2 headings and match to known section ids
  const sections: Letter["sections"] = [];
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
    sections.push({
      id: def.id,
      heading: def.heading,
      markdown: buf.join("\n").trim(),
    });
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

  return LetterSchema.parse({
    clientName: args.clientName,
    propertyAddress: args.extraction.particulars.propertyAddress,
    date: today,
    sections,
  });
}
