import {
  LeaseLetterSchema,
  type ComplianceFinding,
  type LeaseExtractionBundle,
  type LeaseLetter,
  type UnenforceabilityFinding,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import type { CapabilitySynthResult } from "./pass6-capabilities";

const SECTION_DEFS = [
  { id: "summary", heading: "Summary" },
  { id: "classification", heading: "Retail vs non-retail classification" },
  { id: "items", heading: "Lease items" },
  { id: "ongoing_financial_obligations", heading: "Ongoing financial obligations" },
  { id: "make_good", heading: "Make-good assessment" },
  { id: "outgoings", heading: "Outgoings assessment" },
  { id: "additional_provisions", heading: "Non-standard clauses — key concerns" },
  { id: "rla_compliance", heading: "Retail Leases Act compliance" },
  { id: "unenforceability", heading: "Void or unenforceable clauses (landlord non-compliance)" },
  { id: "market_review_projections", heading: "Rent review projections" },
  { id: "option_analysis", heading: "Option-to-renew analysis" },
  { id: "notification_obligations", heading: "Landlord notification obligations" },
  { id: "planning_compliance", heading: "Planning & permitted use" },
  { id: "lease_chain", heading: "Lease chain and supporting documents" },
  { id: "liv_version", heading: "LIV standard-form analysis" },
  { id: "commentary_risks", heading: "Commentary cross-reference" },
  { id: "proposed_amendments_schedule", heading: "Schedule of proposed amendments" },
  { id: "next_steps", heading: "Next steps" },
] as const;

const SYSTEM_PROMPT = `You are drafting a lawyer-reviewable letter of advice to a Victorian TENANT client on a commercial lease. The solicitor will review, edit, and sign off before sending. You MUST:

- Use a professional Australian legal letter tone — direct, solicitor-to-client, first-person plural ("we recommend", "our view").
- Tone for proposed amendments: **polite but firm**. Never aggressive. Never meek.
- Never make statements that could be construed as the final legal advice of the reviewing solicitor. Use phrases like "we recommend you consider", "subject to your solicitor's confirmation".
- Cite specific legislation inline — e.g. (Retail Leases Act 2003 (Vic) s 46).
- Keep each section focused; do not duplicate across sections.
- The client is the TENANT. Your framing throughout is tenant-protective.
- Output must be valid Markdown — use H2 headings (##), lists, **bold**.
- **Use Markdown tables** wherever the content is genuinely tabular (notification schedules, unenforceability summaries, schedule of amendments, rent review projections). Tables make this letter easier to scan for the solicitor and tenant. Keep table cells terse — full prose belongs in the surrounding paragraph.`;

const USER_TEMPLATE = (args: {
  extraction: LeaseExtractionBundle;
  rlaCompliance: ComplianceFinding[];
  unenforceability: UnenforceabilityFinding[];
  capabilities: CapabilitySynthResult;
  clientName: string;
  today: string;
}) => `Client: ${args.clientName} (TENANT)
Premises: ${args.extraction.items.premisesAddress}
Date: ${args.today}
Lease classification: ${args.extraction.classification.kind} (RLA applies: ${args.extraction.classification.rlaApplies})

Draft the letter of advice, section by section, using the exact H2 headings below.

Sections (in order):

1. **Summary** — 1 paragraph: premises, term, rent, critical risks at a glance. Lead with any unenforceability findings — these are the highest-value items in the letter.
2. **Retail vs non-retail classification** — state the classification and the s4 RLA 2003 reasoning. Explain (briefly) what this means for the tenant's statutory protections.
3. **Lease items** — bullet list: parties, premises, permitted use, term + options, commencing rent, rent review method, bank guarantee, personal guarantee (flag if present).
4. **Ongoing financial obligations** — list every ongoing obligation extracted, with severity and whether it continues after lease expiry. Where \`quantified\` is false, flag the open-ended exposure to the tenant.
5. **Make-good assessment** — severity rating, quoted clause, concerns, indicative cost band (use the makeGoodCostBand input), and our proposed amendment. If make-good is bare_shell or heavy, flag prominently and recommend a quantity surveyor referral when \`qsReferralRecommended\` is true.
6. **Outgoings assessment** — items payable; flag every non-standard item (landlord's capital costs, land tax on single-holding, related-party management fees, sinking fund). State whether an annual cap is present. If no cap, recommend one.
7. **Non-standard clauses — key concerns** — for each additional provision classified as tenant_adverse / landlord_favoured / rla_conflict / unusual: quote clause number, summarise, state tenant impact, proposed amendment (polite-but-firm), rationale. Group by focusArea. Skip 'standard' provisions (note count at top).
8. **Retail Leases Act compliance** — if retail: summarise compliance findings (passes, fails, warnings, needs_review). If non-retail: one sentence stating RLA does not apply.
9. **Void or unenforceable clauses (landlord non-compliance)** — for retail leases only. **Begin this section with a Markdown summary table**, columns: \`Section | Effect | Affected clauses | Exposure (AUD) | Confidence\`, sorted by severity (critical/high first), with a footer row totalling the quantified exposure. Then beneath the table, expand each finding in 1–2 short paragraphs covering: the landlord failure, verbatim evidence (≤25 words quoted), the remedy for the tenant. Flag \`needsLawyerConfirm\` items explicitly. This is the **highest-value section** — be precise and cite verbatim.
10. **Rent review projections** — render as a Markdown table with columns: \`Period | Baseline | Projected low | Projected high | Basis\`. One row per marketReviewProjection. Add a one-paragraph caveat under the table that figures are indicative only.
11. **Option-to-renew analysis** — for each optionAnalysis: window, method, conditions, tenant risks, landlord risks, s28A early review and s28B cooling-off availability. Flag any onerous notice form.
12. **Landlord notification obligations** — render this section as a single Markdown table with columns: \`Notification | Citation | Timing | If failed\`. One row per notification obligation. Keep cells terse. Useful as a tickler list for the tenant.
13. **Planning & permitted use** — state the v1 caveat (VicPlan integration deferred) and list any planning permit triggers detected. Recommend the solicitor obtain a Planning Property Report.
14. **Lease chain and supporting documents** — only include if leaseChain.documents.length ≥ 2. List the documents detected, flag any missing (consent, assignor disclosure under s61, head lease).
15. **LIV standard-form analysis** — only if isLiv. State the detected version. Note that v1.5 will provide a clause-by-clause delta against the 2023 LIV baseline.
16. **Commentary cross-reference** — only if commentaryRisks is non-empty. Otherwise omit the section entirely.
17. **Schedule of proposed amendments** — render as a Markdown table with columns: \`# | Clause | Severity | Current | Proposed drafting | Why\`. Number rows 01, 02, 03… Sorted by severity. Below the table, for the top 3 amendments by severity, include the full proposed drafting in a fenced quote block (so the solicitor can cut-and-paste into a markup). Other amendments can stay terse in the table.
18. **Next steps** — action checklist for the tenant: review amendments with solicitor, send markup to landlord, negotiate, sign. Include any conditional questions raised by needs_review unenforceability findings (so the tenant can answer them at the meeting).

Omit sections whose input data is empty (e.g. no rent review projections → omit section 10), but always include 1, 2, 3, 4, 5, 6, 7, 8, 17, 18.

Input data:

### Extraction
${JSON.stringify(args.extraction, null, 2)}

### RLA compliance findings
${JSON.stringify(args.rlaCompliance, null, 2)}

### Unenforceability findings (HIGH VALUE — landlord breaches)
${JSON.stringify(args.unenforceability, null, 2)}

### Capability synthesis (cost band, projections, options, notifications, planning, LIV, lease chain, commentary)
${JSON.stringify(args.capabilities, null, 2)}

Output: begin each section with a Markdown H2 heading exactly matching the heading above. Do not include a top-level title or footer — the template wraps the letter.`;

export async function composeLeaseLetter(args: {
  extraction: LeaseExtractionBundle;
  rlaCompliance: ComplianceFinding[];
  unenforceability: UnenforceabilityFinding[];
  capabilities: CapabilitySynthResult;
  clientName: string;
  onChunk?: (text: string) => void;
}): Promise<LeaseLetter> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const stream = anthropic.messages.stream({
    model: Models.Opus,
    max_tokens: 24000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: USER_TEMPLATE({
          extraction: args.extraction,
          rlaCompliance: args.rlaCompliance,
          unenforceability: args.unenforceability,
          capabilities: args.capabilities,
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
  const sections: LeaseLetter["sections"] = [];
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

  return LeaseLetterSchema.parse({
    clientName: args.clientName,
    clientRole: "tenant",
    premisesAddress: args.extraction.items.premisesAddress,
    date: today,
    sections,
  });
}
