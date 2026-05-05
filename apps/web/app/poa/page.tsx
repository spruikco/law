import Link from "next/link";
import { PoaUploadForm } from "./upload-form";

export default function PoaHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 5 — Powers of attorney
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Power of Attorney review
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Upload an enduring or general Power of Attorney instrument. Claude
            will classify the kind (financial enduring / personal enduring /
            MTDM / supportive / company), extract principal, attorneys, and
            witnesses, check the formal requirements under the Powers of
            Attorney Act 2014 (Vic) — s 22 capacity, s 31 prescribed form, s 33
            execution, s 35 witnessing, s 41 attorney acceptance, s 44
            appointment mode, s 64 conflict, s 65 gifts — and flag equity /
            fiduciary / elder-abuse red flags including indicators that warrant
            VCAT review under Pt 7.
          </p>
        </header>

        <PoaUploadForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Capacity, undue influence, and elder-abuse indicators turn on
          contemporaneous medical and behavioural evidence — every red flag
          must be reviewed and confirmed by the supervising solicitor before
          any application to VCAT or revocation advice is given to the client.
        </aside>
      </main>
    </div>
  );
}
