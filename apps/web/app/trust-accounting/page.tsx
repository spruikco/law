import Link from "next/link";
import { TrustAccountForm } from "./intake-form";

export default function TrustAccountingHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 8 — Trust accounting
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Monthly trust compliance pack
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Reconcile the cashbook against the bank statement, compute the
            trust trial balance per matter ledger, detect overdrawn ledgers
            (LPUL s 145 breach) and missing receipts (LPUGR r 35), and draft
            the monthly compliance pack for the authorised principal to sign
            within the 15-working-day deadline (LPUGR r 53).
          </p>
        </header>

        <TrustAccountForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          The trust trial balance, bank reconciliation and breach register
          must be reviewed and signed by the trust authorised solicitor (LPUL
          s 144(2)) before being filed. An external examiner annual report is
          still required (LPUGR r 65 / LPUL s 158).
        </aside>
      </main>
    </div>
  );
}
