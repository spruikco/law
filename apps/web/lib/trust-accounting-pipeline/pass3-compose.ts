import {
  TrustPackSchema,
  type TrustAccountInput,
  type TrustComplianceFinding,
  type TrustPack,
  type TrustReconciliation,
} from "@law/schema";
import { anthropic, Models } from "../anthropic/client";

const SECTION_DEFS = [
  { id: "header", heading: "Header" },
  { id: "trial_balance", heading: "Trust trial balance" },
  { id: "bank_reconciliation", heading: "Bank reconciliation" },
  { id: "receipts_journal", heading: "Receipts journal" },
  { id: "payments_journal", heading: "Payments journal" },
  { id: "transfers_journal", heading: "Transfers journal" },
  { id: "breach_register", heading: "Breach register" },
  { id: "principal_certification", heading: "Principal certification" },
] as const;

const SYSTEM_PROMPT = `You are drafting a monthly trust accounting compliance pack
under LPUL Pt 4.2 + LPUGR Pt 4.2 Div 6 (Vic). The authorised principal will
sign the pack before lodging / filing. You MUST:

- Use a professional Australian legal-tech compliance tone — formal, neutral.
- Output GitHub-flavoured Markdown with H2 headings (##), tables.
- Cite the LPUL Application Act 2014 (Vic) sections (s 142 / s 144 / s 145 /
  s 152 / s 158) and LPUGR rules (r 35 / r 36 / r 38 / r 47 / r 48 / r 50 /
  r 52 / r 53 / r 65) inline where relevant.
- The "Bank reconciliation" section MUST show: cashbook closing, bank closing,
  unpresented cheques, outstanding deposits, reconciled bank balance, and
  difference. State whether reconciliation balances within $0.005.
- The "Trust trial balance" section MUST list every ledger with opening,
  receipts, payments, transfers, closing, and the trial balance total.
  Highlight overdrawn ledgers (s 145 breach).
- The "Breach register" section MUST list every fail/warning finding with the
  rule id, citation, and remediation.
- The "Principal certification" section MUST be a sign-off block for the
  trust authorised solicitor (LPUL s 144(2)) within 15 working days of period
  end (LPUGR r 53).`;

const buildLedgerTable = (recon: TrustReconciliation): string => {
  if (recon.ledgerBalances.length === 0) return "_No ledger entries this period._";
  const rows = recon.ledgerBalances
    .map(
      (l) =>
        `| ${l.ledgerName.replace(/\|/g, "\\|")} | ${l.matterRef} | $${l.openingBalance.amount.toFixed(2)} | $${l.receipts.amount.toFixed(2)} | $${l.payments.amount.toFixed(2)} | $${l.transfersIn.amount.toFixed(2)} | $${l.transfersOut.amount.toFixed(2)} | ${l.isOverdrawn ? "**$" : "$"}${l.closingBalance.amount.toFixed(2)}${l.isOverdrawn ? " (OVERDRAWN)**" : ""} |`,
    )
    .join("\n");
  return `| Ledger | Matter | Opening | Receipts | Payments | Transfers in | Transfers out | Closing |\n|---|---|---|---|---|---|---|---|\n${rows}\n\n**Trial balance total: $${recon.trialBalanceTotal.amount.toFixed(2)}**`;
};

const buildReceiptsTable = (input: TrustAccountInput): string => {
  if (input.receipts.length === 0) return "_No receipts this period._";
  const rows = input.receipts
    .map(
      (r) =>
        `| ${r.receiptNumber} | ${r.receivedOn} | ${r.receivedFrom.replace(/\|/g, "\\|")} | ${r.matterRef} | ${r.kind} | ${r.paymentMethod} | $${r.amount.amount.toFixed(2)} | ${r.receiptIssuedAt ? "yes" : "**MISSING**"} |`,
    )
    .join("\n");
  return `| Receipt # | Date | From | Matter | Kind | Method | Amount | Receipt issued |\n|---|---|---|---|---|---|---|---|\n${rows}`;
};

const buildPaymentsTable = (input: TrustAccountInput): string => {
  if (input.payments.length === 0) return "_No payments this period._";
  const rows = input.payments
    .map(
      (p) =>
        `| ${p.reference} | ${p.paidOn} | ${p.paidTo.replace(/\|/g, "\\|")} | ${p.matterRef} | ${p.method} | ${p.authority}${p.billNumber ? ` (${p.billNumber})` : ""} | $${p.amount.amount.toFixed(2)} |`,
    )
    .join("\n");
  return `| Ref | Date | To | Matter | Method | Authority | Amount |\n|---|---|---|---|---|---|---|\n${rows}`;
};

const buildTransfersTable = (input: TrustAccountInput): string => {
  if (input.transfers.length === 0) return "_No transfers this period._";
  const rows = input.transfers
    .map(
      (t) =>
        `| ${t.transferredOn} | ${t.fromLedger.replace(/\|/g, "\\|")} | ${t.toLedger.replace(/\|/g, "\\|")} | $${t.amount.amount.toFixed(2)} | ${t.authority} |`,
    )
    .join("\n");
  return `| Date | From | To | Amount | Authority |\n|---|---|---|---|---|\n${rows}`;
};

const USER_TEMPLATE = (
  input: TrustAccountInput,
  recon: TrustReconciliation,
  findings: TrustComplianceFinding[],
  today: string,
): string => `Draft a monthly trust compliance pack.

Today: ${today}

Practice:
${JSON.stringify(input.practice, null, 2)}

Period: ${input.periodStart} to ${input.periodEnd}

Bank statement summary:
${JSON.stringify(input.bankStatement, null, 2)}

Reconciliation outcome:
- Cashbook opening: $${recon.cashbookOpeningBalance.amount.toFixed(2)}
- Receipts total: $${recon.cashbookReceiptsTotal.amount.toFixed(2)}
- Payments total: $${recon.cashbookPaymentsTotal.amount.toFixed(2)}
- Cashbook closing: $${recon.cashbookClosingBalance.amount.toFixed(2)}
- Bank closing: $${recon.bankClosingBalance.amount.toFixed(2)}
- Less unpresented: -$${recon.unpresentedTotal.amount.toFixed(2)}
- Plus outstanding deposits: $${recon.outstandingDepositsTotal.amount.toFixed(2)}
- Reconciled bank: $${recon.reconciledBankBalance.amount.toFixed(2)}
- Difference: $${recon.reconciliationDifference.amount.toFixed(2)} ${recon.reconciles ? "(BALANCED)" : "(BREACH)"}
- Trial balance total: $${recon.trialBalanceTotal.amount.toFixed(2)}
- Trial vs cashbook difference: $${recon.trialVsCashbookDifference.amount.toFixed(2)}
- Overdrawn ledgers: ${recon.overdrawnLedgers.length === 0 ? "(none)" : recon.overdrawnLedgers.map((l) => l.ledgerName).join(", ")}

Trial balance table:
${buildLedgerTable(recon)}

Receipts table:
${buildReceiptsTable(input)}

Payments table:
${buildPaymentsTable(input)}

Transfers table:
${buildTransfersTable(input)}

Compliance findings:
${JSON.stringify(findings, null, 2)}

Sections (use these EXACT H2 headings):

1. **Header** — practice letterhead, period, prepared-by line, "Trust accounting compliance pack" title.
2. **Trust trial balance** — short narrative + reproduce the ledger table.
3. **Bank reconciliation** — narrative + reconciliation table; cite r 53; state explicitly whether it balances.
4. **Receipts journal** — reproduce receipts table; cite r 35 / r 36.
5. **Payments journal** — reproduce payments table; cite r 38 / r 42.
6. **Transfers journal** — reproduce transfers table (omit if no transfers).
7. **Breach register** — list each fail or warning finding. For each, give: rule id, citation, what happened, severity, recommended action. If none, state "No breaches recorded for this period."
8. **Principal certification** — block for the trust authorised solicitor to certify the pack within 15 working days of period end (r 53(2)). Cite s 144(2) / s 158 / r 65 (annual external examiner reminder if applicable).

Begin each section with a Markdown H2 heading exactly matching the heading above.`;

export async function composeTrustPack(args: {
  input: TrustAccountInput;
  reconciliation: TrustReconciliation;
  findings: TrustComplianceFinding[];
  onChunk?: (text: string) => void;
}): Promise<TrustPack> {
  const today = new Date().toISOString().slice(0, 10);
  let full = "";

  const userMessage = USER_TEMPLATE(
    args.input,
    args.reconciliation,
    args.findings,
    today,
  );

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

  const sections: TrustPack["sections"] = [];
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

  return TrustPackSchema.parse({ date: today, sections });
}
