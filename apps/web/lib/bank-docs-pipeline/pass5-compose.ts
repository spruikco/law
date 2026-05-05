import {
  BankDocsLetterSchema,
  type BankDocComplianceFinding,
  type BankDocsExtractionBundle,
  type BankDocsLetter,
  type BankUnenforceabilityFinding,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";
import type { BankDocsCapabilitySynthResult } from "./pass6-capabilities";

const SECTION_DEFS = [
  { id: "summary", heading: "Summary" },
  { id: "classification", heading: "Classification — NCC, ACL UCT, third-party guarantee" },
  { id: "particulars", heading: "Facility particulars" },
  { id: "interest_and_repayments", heading: "Interest, repayments and rate-shock scenarios" },
  { id: "securities_and_guarantees", heading: "Securities and guarantees" },
  { id: "fees_and_costs", heading: "Fees and costs (ladder)" },
  { id: "default_and_enforcement", heading: "Default events and enforcement" },
  { id: "borrower_adverse_clauses", heading: "Borrower-adverse / unusual clauses" },
  { id: "guarantor_protections", heading: "Guarantor protections (Code of Banking Practice + Garcia)" },
  { id: "ncc_compliance", heading: "National Credit Code compliance" },
  { id: "acl_unfair_terms", heading: "ACL unfair contract terms assessment" },
  { id: "ppsa_assessment", heading: "PPSA assessment" },
  { id: "unenforceability", heading: "Void or unenforceable terms (lender non-compliance)" },
  { id: "repayment_scenarios", heading: "Repayment stress-tests" },
  { id: "covenant_dashboard", heading: "Financial covenant dashboard" },
  { id: "cross_default_map", heading: "Cross-default map" },
  { id: "regulatory_hooks", heading: "Regulatory hooks (AFCA / NCC hardship / Banking Code)" },
  { id: "proposed_amendments_schedule", heading: "Schedule of proposed amendments" },
  { id: "next_steps", heading: "Next steps" },
] as const;

const SYSTEM_PROMPT = `You are drafting a lawyer-reviewable letter of advice to a borrower (or third-party guarantor) on a set of Australian bank documents (mortgage, loan agreement, letter of offer, guarantee, GSA). The supervising solicitor will review and sign before sending. You MUST:

- Use a professional Australian banking-and-finance legal letter tone — direct, solicitor-to-client, first-person plural ("we recommend", "our view"). Tone for proposed amendments: **polite but firm**. Banks rarely amend pure boilerplate but routinely adjust where a clear ACL UCT or NCC unjustness point is raised — pitch the redlines accordingly.
- The client is the BORROWER (or, where indicated, the third-party GUARANTOR). All framing is borrower-protective / guarantor-protective.
- Never make statements that could be construed as final legal advice. Use "we recommend you consider", "subject to your solicitor's confirmation".
- Cite specific legislation inline — e.g. (NCC s 17), (ACL s 24), (PPSA s 267), (Banking Code 2025 cl 31).
- Output must be valid Markdown — H2 headings (##), lists, **bold**.
- **Use Markdown tables** for tabular content: schedule of amendments, covenant dashboard, fee ladder, repayment scenarios, regulatory hooks. Tables make this letter scannable for the solicitor.
- The unenforceability section is the **highest-value section** — use a summary table + per-finding paragraphs. Quote evidence verbatim (≤25 words).`;

const USER_TEMPLATE = (args: {
  extraction: BankDocsExtractionBundle;
  compliance: BankDocComplianceFinding[];
  unenforceability: BankUnenforceabilityFinding[];
  capabilities: BankDocsCapabilitySynthResult;
  clientName: string;
  clientRole: "borrower" | "guarantor";
  today: string;
}) => `Client: ${args.clientName} (${args.clientRole.toUpperCase()})
Date: ${args.today}
Document set: ${args.extraction.classification.kind}${args.extraction.particulars.facilityAmount ? ` · ${args.extraction.particulars.facilityAmount.raw}` : ""}
Lender: ${args.extraction.particulars.lenderName ?? "(not extracted)"}
Borrower: ${args.extraction.particulars.borrowerName ?? "(not extracted)"}
NCC applies: ${args.extraction.classification.isConsumerCredit} · ACL UCT regime: ${args.extraction.classification.isUnfairContractTermsRegime} · Third-party guarantee: ${args.extraction.classification.isThirdPartyGuarantee}

Draft the letter of advice, section by section, using the exact H2 headings below.

Sections (in order):

1. **Summary** — 1 paragraph: facility, key risks at a glance. Lead with any unenforceability findings — these are the highest-value items.
2. **Classification — NCC, ACL UCT, third-party guarantee** — state the classification and the s5 NCC reasoning. Explain (briefly) what each protective regime means for the client's rights.
3. **Facility particulars** — bullet list: parties, amount, kind, purpose, term, drawdown conditions, governing law.
4. **Interest, repayments and rate-shock scenarios** — interest type and rate, default rate (if any). Include the **base case + rate shocks (+1%, +3%) + IO→P&I switch + default rate** rows in a Markdown table from the repaymentScenarios input. Add a one-paragraph caveat that figures are indicative.
5. **Securities and guarantees** — list each security item. For guarantees: state cap, principal-debtor clause, ILA requirement, Code of Banking Practice cl 31 / Banking Code 2025 Pt 4 issues, Garcia volunteer-guarantor risk flags.
6. **Fees and costs (ladder)** — render as a Markdown table from feeLadder, columns: \`Scenario | Fees | Total (AUD)\`. One row per scenario.
7. **Default events and enforcement** — list events of default, notice mechanism, self-help clauses. Flag any clause permitting entry / sale / set-off without notice or court order. Note s 88 NCC default-notice requirement if consumer credit.
8. **Borrower-adverse / unusual clauses** — for each provision classified as borrower_adverse / guarantor_adverse / lender_favoured / unusual / ncc_conflict / acl_uct_candidate: quote clause number, summarise, state borrower impact, proposed amendment (polite-but-firm), rationale. Group by focusArea. Flag uctCandidate=true items prominently.
9. **Guarantor protections (Code of Banking Practice + Garcia)** — only include if classification.isThirdPartyGuarantee. Cover: Code of Banking Practice 2025 Pt 4 obligations, Garcia/Yerkey risk factors, ILA recommendations, principal-debtor clause warning.
10. **National Credit Code compliance** — only if isConsumerCredit. Summarise NCC compliance findings (passes/fails/warnings). Highlight any disclosure failures (s 16/17). If non-NCC: omit section.
11. **ACL unfair contract terms assessment** — only if isUnfairContractTermsRegime. Summarise UCT findings, list strongest UCT candidates from provisions, note November 2023 penalty regime. If outside regime: omit.
12. **PPSA assessment** — only if PPSA security present. Summarise collateral classes, perfection requirements, vesting risk on insolvency (s 267). If no PPSA: omit.
13. **Void or unenforceable terms (lender non-compliance)** — **Begin with a Markdown summary table**, columns: \`Doctrine | Effect | Affected clauses | Exposure (AUD) | Confidence\`, sorted by severity (critical/high first), with footer row totalling quantified exposure. Then beneath the table, expand each finding in 1–2 short paragraphs covering: lender conduct or term, verbatim evidence (≤25 words quoted), remedy for borrower, citation. Flag \`needsLawyerConfirm\` items explicitly. **Highest-value section.**
14. **Repayment stress-tests** — render as a Markdown table from repaymentScenarios, columns: \`Scenario | Monthly | Total interest | Effective rate | Notes\`. Add one-paragraph caveat.
15. **Financial covenant dashboard** — render as a Markdown table from covenants, columns: \`Covenant | Threshold | Test frequency | Consequence | Severity\`. One row per covenant.
16. **Cross-default map** — only include if crossDefault.hasCrossDefault. Describe the trigger, affected facilities, group-company impact, and the surprise outcomes for the borrower.
17. **Regulatory hooks (AFCA / NCC hardship / Banking Code)** — render as a Markdown table from regulatoryHooks, columns: \`Regime | Description | Available? | How to invoke\`.
18. **Schedule of proposed amendments** — render as a Markdown table, columns: \`# | Clause | Severity | Current | Proposed drafting | Why\`. Number rows 01, 02, 03… Sorted by severity. Below the table, for the top 3 amendments by severity, include the full proposed drafting in fenced quote blocks (so the solicitor can cut-and-paste).
19. **Next steps** — action checklist for the client: review amendments with solicitor, send markup to lender, negotiate, sign. Include any conditional questions raised by needs_review unenforceability findings.

Omit sections whose input data is empty (e.g. no PPSA → omit section 12), but always include 1, 2, 3, 4, 5, 7, 8, 18, 19.

Input data:

### Extraction
${JSON.stringify(args.extraction, null, 2)}

### NCC / ACL / PPSA / Banking Code compliance findings
${JSON.stringify(args.compliance, null, 2)}

### Unenforceability findings (HIGH VALUE — lender breaches / unjust transactions)
${JSON.stringify(args.unenforceability, null, 2)}

### Capability synthesis (repayment scenarios, fee ladder, covenants, cross-default, regulatory hooks)
${JSON.stringify(args.capabilities, null, 2)}

Output: begin each section with a Markdown H2 heading exactly matching the heading above. Do not include a top-level title or footer — the template wraps the letter.`;

export async function composeBankDocsLetter(args: {
  extraction: BankDocsExtractionBundle;
  compliance: BankDocComplianceFinding[];
  unenforceability: BankUnenforceabilityFinding[];
  capabilities: BankDocsCapabilitySynthResult;
  clientName: string;
  clientRole?: "borrower" | "guarantor";
  onChunk?: (text: string) => void;
}): Promise<BankDocsLetter> {
  const today = new Date().toISOString().slice(0, 10);
  const clientRole = args.clientRole ?? "borrower";
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
          compliance: args.compliance,
          unenforceability: args.unenforceability,
          capabilities: args.capabilities,
          clientName: args.clientName,
          clientRole,
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

  // Split full markdown by H2 headings and match to known section ids
  const sections: BankDocsLetter["sections"] = [];
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

  return BankDocsLetterSchema.parse({
    clientName: args.clientName,
    clientRole,
    facilityRef: args.extraction.particulars.facilityAmount?.raw,
    date: today,
    sections,
  });
}
