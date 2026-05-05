import Link from "next/link";

interface Module {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  status: "live" | "scaffold";
}

const modules: Module[] = [
  {
    href: "/s32",
    eyebrow: "Module 1",
    title: "Contract of Sale + Section 32",
    body: "Upload the Contract of Sale and Section 32 Vendor Statement. Claude classifies each document, extracts particulars, runs compliance checks against the Sale of Land Act, analyses risk, and drafts a lawyer-reviewable letter of advice — with citations.",
    cta: "Start a property review",
    status: "live",
  },
  {
    href: "/lease",
    eyebrow: "Module 2",
    title: "Commercial lease review",
    body: "Upload a Victorian commercial lease. Claude classifies retail vs non-retail under s4 RLA, extracts items + additional provisions, flags tenant-adverse clauses (ongoing financial obligations, make-good, outgoings), and drafts a polite-but-firm schedule of proposed amendments against the 2023 LIV baseline.",
    cta: "Start a lease review",
    status: "live",
  },
  {
    href: "/cost-disclosure",
    eyebrow: "Module 3",
    title: "Cost disclosure (LPUL s 174)",
    body: "Generate s 174-compliant cost disclosure: fee basis, estimate, hourly rates, disbursements, billing terms, conditional costs (s 181), uplift cap (s 182), and Pt 5.4 dispute-resolution rights — checklist verified before drafting.",
    cta: "Generate cost disclosure",
    status: "live",
  },
  {
    href: "/bank-docs",
    eyebrow: "Module 4",
    title: "Bank documents review",
    body: "Mortgages, loan agreements, third-party guarantees and GSAs. Classifies under NCC + ACL UCT, flags void / unenforceable terms (Garcia, Amadio, NCC s 76, ACL UCT, PPSA s 267) and drafts a polite-but-firm borrower-protective amendment schedule.",
    cta: "Start a bank documents review",
    status: "live",
  },
  {
    href: "/poa",
    eyebrow: "Module 5",
    title: "Powers of Attorney review",
    body: "Validate enduring + general POAs against the Powers of Attorney Act 2014 (Vic) — ss 22 / 31 / 33 / 35 / 41 / 44 / 64 / 65. Detects equity / fiduciary / elder-abuse red flags and recommends VCAT review options under Pt 7.",
    cta: "Start a Power of Attorney review",
    status: "live",
  },
  {
    href: "/wills",
    eyebrow: "Module 6",
    title: "Wills review",
    body: "Execution validity (Wills Act 1997 (Vic) s 7), informal-execution risk (s 9), capacity (s 5), interested-witness (s 13), beneficiary clarity, residue, and family-provision exposure under AP Act 1958 (Vic) Pt IV.",
    cta: "Start a will review",
    status: "live",
  },
  {
    href: "/conveyance",
    eyebrow: "Module 7",
    title: "Conveyance — settlement statement",
    body: "Compute pro-rata adjustments (council/water/OC/land tax) + VIC stamp duty (Duties Act 2000 (Vic) — PPR / FHB / pensioner / FPAD), check against SLA s 32 / s 27 / s 10G + Land Tax Act s 96 + OC Act s 23, and draft the settlement statement + post-settlement checklist (NoA, TLA registration, deposit handling).",
    cta: "Generate a settlement statement",
    status: "live",
  },
  {
    href: "/trust-accounting",
    eyebrow: "Module 8",
    title: "Trust accounting compliance",
    body: "Monthly trust pack: cashbook ↔ bank reconciliation (LPUGR r 53), per-matter trial balance (r 52), overdrawn-ledger detection (s 145 breach), receipts (r 35) + payments (r 38) journals, breach register and principal certification.",
    cta: "Reconcile a month",
    status: "live",
  },
  {
    href: "/billing",
    eyebrow: "Module 9",
    title: "Billing automation",
    body: "Generate LPUL Pt 4.3 bills + tax invoices: deterministic totals (fees + uplift + GST + trust offset + prior paid), checklist across s 172 / s 182 / s 186 / s 187 / s 192 / s 193 / s 195, plus the GST Act s 29-70 tax-invoice form.",
    cta: "Generate a bill",
    status: "live",
  },
];

export default function Home() {
  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-6xl px-8 py-16">
        <header className="mb-12">
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            LAW — Australian legal automation, VIC first
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            Choose a module
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600 leading-relaxed">
            Automated first-pass review and drafting for Victorian legal
            practice. Every output is a draft for the supervising solicitor to
            review and sign off before being provided to a client. Other
            jurisdictions are scaffolded — rule packs land per state.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`group block rounded-xl border p-6 shadow-sm transition-all hover:shadow-md ${
                m.status === "live"
                  ? "border-zinc-200 bg-white hover:border-zinc-900"
                  : "border-dashed border-zinc-300 bg-white/50 hover:border-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-widest uppercase text-zinc-500">
                  {m.eyebrow}
                </div>
                {m.status === "scaffold" && (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
                    Scaffold
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-black">
                {m.title}
              </h2>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed">
                {m.body}
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
                {m.cta}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>

        <aside className="mt-12 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Drafting tool, not legal advice.</strong>{" "}
          Every output must be reviewed and signed off by the supervising
          solicitor before being provided to a client.
        </aside>
      </main>
    </div>
  );
}
