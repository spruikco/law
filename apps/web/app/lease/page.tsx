import Link from "next/link";
import { LeaseUploadForm } from "./upload-form";

export default function LeaseHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 2 — Lease review
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Victorian commercial lease review
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Upload the lease PDF (LIV 2023 form + any Additional Provisions
            schedule). Claude will classify retail vs non-retail under s4 of the
            Retail Leases Act 2003, extract items and additional provisions,
            assess make-good and outgoings, flag tenant-adverse clauses, and
            draft a polite-but-firm schedule of proposed amendments for a tenant
            client.
          </p>
        </header>

        <LeaseUploadForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Every proposed amendment must be reviewed and signed off by the
          supervising solicitor before being sent to the landlord.
        </aside>
      </main>
    </div>
  );
}
