import {
  WillLetterSchema,
  type FamilyProvisionRisk,
  type WillExtraction,
  type WillFinding,
  type WillLetter,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "summary", heading: "Summary" },
  { id: "classification", heading: "Classification" },
  { id: "execution_validity", heading: "Execution validity" },
  { id: "testator_capacity", heading: "Testator capacity and knowledge & approval" },
  { id: "executors_and_witnesses", heading: "Executors and witnesses" },
  { id: "beneficiaries_and_gifts", heading: "Beneficiaries and gifts" },
  { id: "residue", heading: "Residue and partial-intestacy risk" },
  { id: "informal_execution_s9", heading: "Informal execution (s 9)" },
  { id: "family_provision_exposure", heading: "Family provision exposure (AP Act Pt IV)" },
  { id: "tax_super_interaction", heading: "Tax / superannuation interaction" },
  { id: "remediation_steps", heading: "Remediation steps" },
  { id: "next_steps", heading: "Next steps" },
] as const;

const SYSTEM_PROMPT = `You are drafting a lawyer-reviewable letter of advice on a will.
The supervising solicitor will review and sign before sending. You MUST:

- Use a professional Australian legal letter tone — solicitor-to-client.
- Cite specific legislation inline — e.g. (Wills Act 1997 (Vic) s 7), (AP Act 1958 (Vic) s 90).
- Output Markdown with H2 headings (##), lists, **bold**.
- Use Markdown tables for: validity findings, family-provision risks, remediation steps.
- Family-provision exposure is highly sensitive — every claim must be flagged for the
  supervising solicitor to confirm. Cite Vigolo v Bostin (2005) for moral-duty assessment.
- Use "we recommend you consider", "subject to your solicitor's confirmation".
- Never make statements that could be construed as final legal advice.`;

const USER_TEMPLATE = (args: {
  extraction: WillExtraction;
  findings: WillFinding[];
  fpRisks: FamilyProvisionRisk[];
  clientName: string;
  clientRole: "testator" | "executor" | "beneficiary" | "interested_party";
  today: string;
}) => `Client: ${args.clientName} (${args.clientRole.replace(/_/g, " ").toUpperCase()})
Date: ${args.today}
Document: ${args.extraction.classification.kind}
Testator: ${args.extraction.testator.name}

Sections (use the exact H2 headings):

1. **Summary** — 1 paragraph. Lead with the verdict (valid / informally executed / invalid)
   and any critical Pt IV exposure.
2. **Classification** — kind, home-made vs solicitor-prepared, formal attestation.
3. **Execution validity** — table from validity findings (Rule | Status | Severity |
   Explanation), expand any FAIL/WARNING.
4. **Testator capacity and knowledge & approval** — Banks v Goodfellow analysis if
   capacity-related findings; flag suspicious-circumstances doctrine where a major
   beneficiary may have arranged the will.
5. **Executors and witnesses** — list executors and alternates, flag interested-witness
   issues under s 13 with the saving exceptions.
6. **Beneficiaries and gifts** — list each gift with type. Flag ademption risk.
7. **Residue and partial-intestacy risk** — present residue clause if any; if missing,
   explain partial-intestacy distribution under AP Act 1958 (Vic) ss 51-52.
8. **Informal execution (s 9)** — only if the will is not formally executed.
9. **Family provision exposure (AP Act Pt IV)** — Markdown table from fpRisks
   (Eligible person | Category | Severity | Reasoning | Mitigations). Beneath, expand
   each in 1-2 sentences and reference Vigolo v Bostin (2005). Recommend a statement of
   reasons for any disinheritance.
10. **Tax / superannuation interaction** — only if super or testamentary trusts referenced.
11. **Remediation steps** — Markdown table: # | Step | Why | Citation. Cover re-execution,
    s 9 application, codicil, statement of reasons, BDBN updates.
12. **Next steps** — action checklist.

Omit sections whose input data is empty. Always include 1, 2, 3, 4, 5, 6, 7, 12.

Input:

### Extraction
${JSON.stringify(args.extraction, null, 2)}

### Validity findings
${JSON.stringify(args.findings, null, 2)}

### Family-provision risks
${JSON.stringify(args.fpRisks, null, 2)}

Begin each section with a Markdown H2 heading exactly matching the heading above.`;

export async function composeWillLetter(args: {
  extraction: WillExtraction;
  findings: WillFinding[];
  fpRisks: FamilyProvisionRisk[];
  clientName: string;
  clientRole?: "testator" | "executor" | "beneficiary" | "interested_party";
  onChunk?: (text: string) => void;
}): Promise<WillLetter> {
  const today = new Date().toISOString().slice(0, 10);
  const clientRole = args.clientRole ?? "testator";
  let full = "";

  const stream = anthropic.messages.stream({
    model: Models.Opus,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: USER_TEMPLATE({
          extraction: args.extraction,
          findings: args.findings,
          fpRisks: args.fpRisks,
          clientName: args.clientName,
          clientRole,
          today,
        }),
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      args.onChunk?.(event.delta.text);
    }
  }

  const sections: WillLetter["sections"] = [];
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

  return WillLetterSchema.parse({
    clientName: args.clientName,
    clientRole,
    date: today,
    sections,
  });
}
