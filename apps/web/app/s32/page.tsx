import Link from "next/link";
import { UploadForm } from "../upload-form";

export default function S32Home() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 1 — Property review
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Victorian Contract &amp; Section 32 review
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Upload the Contract of Sale and Section 32 Vendor Statement. Claude
            will classify each document, extract the particulars, run compliance
            checks against the Sale of Land Act, and draft a lawyer-reviewable
            letter of advice — with citations.
          </p>
        </header>

        <UploadForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Every letter must be reviewed and signed off by the supervising
          solicitor before being provided to a client.
        </aside>
      </main>
    </div>
  );
}
