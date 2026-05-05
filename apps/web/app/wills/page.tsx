import Link from "next/link";
import { WillsUploadForm } from "./upload-form";

export default function WillsHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 6 — Wills
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Will review
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Upload a will or codicil. Claude will classify the instrument,
            extract testator, executors, witnesses, and beneficiaries, run
            execution-validity checks under the Wills Act 1997 (Vic) — s 5
            capacity, s 7 execution, s 8A knowledge &amp; approval, s 9
            informal-execution, s 13 interested-witness — and analyse
            family-provision (TFM) exposure under the Administration and
            Probate Act 1958 (Vic) Pt IV.
          </p>
        </header>

        <WillsUploadForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Capacity, knowledge &amp; approval, and family-provision exposure
          turn on contemporaneous evidence and the moral-duty assessment in
          Vigolo v Bostin (2005) — every finding must be reviewed and confirmed
          by the supervising solicitor before any advice is given.
        </aside>
      </main>
    </div>
  );
}
