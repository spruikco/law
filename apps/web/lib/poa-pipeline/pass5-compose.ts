import {
  PoaLetterSchema,
  type PoaComplianceFinding,
  type PoaExtraction,
  type PoaLetter,
  type PoaRedFlag,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "summary", heading: "Summary" },
  { id: "classification", heading: "Classification" },
  { id: "parties", heading: "Parties" },
  { id: "execution_and_witnessing", heading: "Execution and witnessing" },
  { id: "scope_and_conditions", heading: "Scope and conditions" },
  { id: "validity", heading: "Validity assessment" },
  { id: "red_flags", heading: "Red flags (equity / abuse / fiduciary)" },
  { id: "compliance", heading: "Compliance findings" },
  { id: "vcat_review_options", heading: "VCAT review options" },
  { id: "remediation_steps", heading: "Remediation steps" },
  { id: "next_steps", heading: "Next steps" },
] as const;

const SYSTEM_PROMPT = `You are drafting a lawyer-reviewable letter of advice on a Power of Attorney instrument.
The supervising solicitor will review and sign before sending. You MUST:

- Use a professional Australian legal letter tone — solicitor-to-client, "we recommend".
- Cite specific legislation inline — e.g. (Powers of Attorney Act 2014 (Vic) s 35).
- The output is Markdown — H2 headings (##), lists, **bold**.
- Use Markdown tables for: validity findings, red flags, remediation steps. One row per item.
- Red flags are equity / fiduciary / abuse-pattern findings — flag them prominently and mark needsLawyerConfirm explicitly.
- Suggest VCAT review under PoA Act Pt 7 where there is evidence of misuse, capacity doubt, or deadlock.
- Never make statements that could be construed as final legal advice. Use "we recommend you consider", "subject to your solicitor's confirmation".`;

const USER_TEMPLATE = (args: {
  extraction: PoaExtraction;
  validity: PoaComplianceFinding[];
  redFlags: PoaRedFlag[];
  clientName: string;
  clientRole: "principal" | "attorney" | "interested_party";
  today: string;
}) => `Client: ${args.clientName} (${args.clientRole.replace(/_/g, " ").toUpperCase()})
Date: ${args.today}
Document type: ${args.extraction.classification.kind}
Principal: ${args.extraction.principal.name}
Attorneys: ${args.extraction.attorneys.map((a) => a.name).join(", ") || "(none extracted)"}

Draft the letter section by section using the exact H2 headings below.

Sections:

1. **Summary** — 1 paragraph. Lead with the validity verdict (valid / partially valid / invalid) and any critical red flag.
2. **Classification** — kind, isEnduring, scope (financial / personal / medical), prescribed-form status, appointment mode.
3. **Parties** — principal, each attorney (role, relationship, acceptance signed?), witnesses (qualification each).
4. **Execution and witnessing** — execution date, effective trigger, whether the s 33 / s 35 formal requirements are met. Flag any irregularity.
5. **Scope and conditions** — quote the scope clause; list any conditions / limitations; flag broad gift authorisations and conflict-transaction authorisations.
6. **Validity assessment** — Markdown table from the validity findings: \`Rule | Status | Severity | Explanation\`. One row per finding. Below the table, expand any FAIL or WARNING in 1-2 sentences.
7. **Red flags (equity / abuse / fiduciary)** — Markdown table from redFlags: \`Category | Severity | Title | Recommended action\`. Beneath, expand each in a short paragraph quoting the trigger signals and any evidence. Flag needsLawyerConfirm explicitly.
8. **Compliance findings** — only if compliance has needs_review items not covered above.
9. **VCAT review options** — if any red flag is critical or if there is capacity doubt / self-dealing / deadlock, summarise the VCAT review jurisdiction under PoA Act Pt 7 and the orders VCAT can make (revoke, suspend, vary, order compensation under s 77).
10. **Remediation steps** — Markdown table: \`# | Step | Why | Citation\`. Cover re-execution where formal defects exist, attorney-acceptance signing, ILA recommendations, or VCAT application.
11. **Next steps** — action checklist for the client.

Omit sections whose input data is empty. Always include 1, 2, 3, 4, 5, 6, 11.

Input:

### Extraction
${JSON.stringify(args.extraction, null, 2)}

### Validity findings
${JSON.stringify(args.validity, null, 2)}

### Red flags
${JSON.stringify(args.redFlags, null, 2)}

Begin each section with a Markdown H2 heading exactly matching the heading above.`;

export async function composePoaLetter(args: {
  extraction: PoaExtraction;
  validity: PoaComplianceFinding[];
  redFlags: PoaRedFlag[];
  clientName: string;
  clientRole?: "principal" | "attorney" | "interested_party";
  onChunk?: (text: string) => void;
}): Promise<PoaLetter> {
  const today = new Date().toISOString().slice(0, 10);
  const clientRole = args.clientRole ?? "principal";
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
          validity: args.validity,
          redFlags: args.redFlags,
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

  const sections: PoaLetter["sections"] = [];
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

  return PoaLetterSchema.parse({
    clientName: args.clientName,
    clientRole,
    date: today,
    sections,
  });
}
