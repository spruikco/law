import Link from "next/link";
import { BillingForm } from "./intake-form";

export default function BillingHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 9 — Billing
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            LPUL Pt 4.3 bill generator
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Enter line items, disbursements, and matter context. Claude
            calculates totals + GST, runs the LPUL Pt 4.3 compliance checklist
            (s 172 fair-and-reasonable, s 182 uplift cap, s 186 form, s 187
            itemised-bill rights, s 192 client-rights notice, s 193 interest,
            trust-money handling), and drafts a bill + tax invoice with the
            mandatory rights notice ready for the supervising solicitor to
            sign under s 186.
          </p>
        </header>

        <BillingForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          The bill must be reviewed and signed by an Australian legal
          practitioner of the law practice (s 186) before being given to the
          client. Failure to comply with Pt 4.3 may make costs non-recoverable
          and exposes the practice to s 178 / Pt 5.4 review.
        </aside>
      </main>
    </div>
  );
}
