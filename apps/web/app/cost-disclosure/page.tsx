import Link from "next/link";
import { CostDisclosureForm } from "./intake-form";

export default function CostDisclosureHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 3 — Cost disclosure
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            LPUL s 174 cost disclosure generator
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Provide the matter brief and Claude will check the s 174 mandatory
            elements and draft a compliant cost disclosure ready for the
            supervising solicitor to review and sign. Covers fee basis,
            estimate, hourly rates, disbursements, billing terms, conditional
            costs (s 181) and uplift cap (s 182), and the dispute-resolution
            avenues under Pt 5.4.
          </p>
        </header>

        <CostDisclosureForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Cost disclosure must be tailored to the matter and reviewed and
          signed by the supervising solicitor before being provided to the
          client. Failure to comply with s 174 makes costs non-recoverable
          under s 178.
        </aside>
      </main>
    </div>
  );
}
