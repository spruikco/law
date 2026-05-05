import Link from "next/link";
import { BankDocsUploadForm } from "./upload-form";

export default function BankDocsHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 4 — Bank documents review
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Mortgage / loan / guarantee review
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Upload the lender pack — letter of offer, mortgage, loan agreement,
            guarantee, GSA. Claude will classify the documents under the
            National Credit Code and ACL Pt 2-3 unfair contract terms regime,
            extract facility particulars and securities, run NCC / Banking Code
            / PPSA compliance checks, identify void or unenforceable terms
            (Garcia, Amadio, NCC s 76, ACL UCT, PPSA s 267), flag
            borrower-adverse clauses, and draft a polite-but-firm schedule of
            proposed amendments.
          </p>
        </header>

        <BankDocsUploadForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Every proposed amendment must be reviewed and signed off by the
          supervising solicitor before being sent to the lender. Garcia /
          Amadio / NCC s 76 findings turn on equitable doctrine and require
          solicitor confirmation.
        </aside>
      </main>
    </div>
  );
}
