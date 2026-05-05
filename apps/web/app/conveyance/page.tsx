import Link from "next/link";
import { ConveyanceForm } from "./intake-form";

export default function ConveyanceHome() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-4xl px-8 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; All modules
        </Link>
        <header className="mt-4 mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Module 7 — Conveyance
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            VIC settlement statement
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Compute pro-rata adjustments (council rates, water, owners
            corporation, land tax — Property Law Act 1958 (Vic), Land Tax Act
            2005 (Vic) s 96), calculate stamp duty under the Duties Act 2000
            (Vic) (with PPR / FHB / pensioner / off-the-plan / FPAD), check
            against Sale of Land Act 1962 (Vic) s 32 / s 27 / s 10G and PEXA
            preparation, then draft the settlement statement and the
            post-settlement notification checklist.
          </p>
        </header>

        <ConveyanceForm />

        <aside className="mt-16 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          The settlement statement and adjustments must be reviewed and signed
          by the supervising solicitor before settlement. Stamp duty
          calculations are an approximation of Duties Act 2000 (Vic) bands and
          concessions and must be confirmed against SRO Duties Online before
          the PEXA workspace is signed.
        </aside>
      </main>
    </div>
  );
}
