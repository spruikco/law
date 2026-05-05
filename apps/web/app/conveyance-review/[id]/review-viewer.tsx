"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  ConveyanceFinding,
  ConveyanceReview,
  ConveyanceReviewStatus,
} from "@law/schema";

interface Stage {
  status: ConveyanceReviewStatus;
  label: string;
  sub: string;
  model: string;
}

const STAGES: Stage[] = [
  {
    status: "computing_adjustments",
    label: "Compute adjustments + stamp duty",
    sub: "Pro-rata council/water/OC/land tax + Duties Act 2000 (Vic) bands and concessions",
    model: "Pure JS",
  },
  {
    status: "checking_compliance",
    label: "Check VIC settlement compliance",
    sub: "13 rules across SLA s 32 / s 27 / s 10G, Land Tax Act s 96, Duties Act, OC Act s 23",
    model: "Claude Sonnet 4.6",
  },
  {
    status: "drafting_statement",
    label: "Draft settlement statement",
    sub: "Header · matter summary · price · adjustments · duty · totals · payment directions · post-settlement checklist · sign-off",
    model: "Claude Opus 4.6",
  },
];

const STATUS_ORDER: Record<ConveyanceReviewStatus, number> = {
  pending: 0,
  computing_adjustments: 1,
  checking_compliance: 2,
  drafting_statement: 3,
  complete: 4,
  settled: 4,
  failed: -1,
};

interface ProgressEvent {
  message: string;
  current?: number;
  total?: number;
  pass: number;
}

function statusBadge(s: string): string {
  switch (s) {
    case "pass":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "fail":
      return "bg-red-100 text-red-900 ring-red-200";
    case "warning":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "needs_review":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

function severityBadge(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-red-100 text-red-900 ring-red-200";
    case "high":
      return "bg-orange-100 text-orange-900 ring-orange-200";
    case "medium":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ConveyanceViewer({ initial }: { initial: ConveyanceReview }) {
  const [review, setReview] = useState<ConveyanceReview>(initial);
  const [docStream, setDocStream] = useState<string>("");
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/conveyance/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as ConveyanceReview);
        else if (data.type === "letter_chunk") setDocStream((p) => p + data.text);
        else if (data.type === "progress") {
          setProgressByPass((prev) => ({
            ...prev,
            [data.pass]: {
              message: data.message,
              current: data.current,
              total: data.total,
              pass: data.pass,
            },
          }));
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [initial.id, initial.status]);

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const complete = review.status === "complete" || review.status === "settled";
  const failed = review.status === "failed";

  const findings = review.findings ?? [];
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;
  const calc = review.calculation;
  const input = review.input;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/conveyance" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; Conveyance module
        </Link>
        <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
          Settlement statement · {review.id.slice(0, 8)} · acting for {input.side}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
          {input.property.addressLine}, {input.property.suburb} {input.property.postcode}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            Settlement {input.settlementDate}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            Vendor {input.vendor.name}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            Purchaser {input.purchaser.name}
          </span>
        </div>
      </header>

      {/* Headline stats */}
      {calc && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Settlement totals
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Contract price" text={`$${fmt(calc.contractPrice.amount)}`} />
            <Stat label="Less deposit" text={`$${fmt(calc.depositPaid.amount)}`} />
            <Stat label="Net debits" text={`$${fmt(calc.netDebits.amount)}`} />
            <Stat label="Net credits" text={`$${fmt(calc.netCredits.amount)}`} />
            <Stat
              label="Total at settlement"
              text={`$${fmt(calc.totalAtSettlement.amount)}`}
              tone="strong"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-zinc-500">Stamp duty payable: </span>
              <span className="font-mono font-semibold">
                ${fmt(calc.stampDuty.totalDutyPayable.amount)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Dutiable value: </span>
              <span className="font-mono">${fmt(calc.stampDuty.dutiableValue.amount)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Adjustment lines: </span>
              <span className="font-mono">{calc.adjustments.length}</span>
            </div>
          </div>
        </section>
      )}

      {/* Stepper */}
      <ol className="space-y-3">
        {STAGES.map((stage, i) => {
          const idx = i + 1;
          const isPast = stageIdx > idx;
          const isCurrent = stageIdx === idx;
          const evt = progressByPass[idx];
          const dotClass = failed && isCurrent
            ? "bg-red-500"
            : isPast
              ? "bg-emerald-500"
              : isCurrent
                ? "bg-zinc-900 animate-pulse"
                : "bg-zinc-300";
          return (
            <li
              key={stage.status}
              className={`flex items-start gap-4 rounded-md border p-4 ${
                isCurrent ? "border-zinc-900 bg-white shadow-sm" : "border-zinc-200 bg-white"
              }`}
            >
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">
                    {idx}. {stage.label}
                  </div>
                  <div className="text-xs text-zinc-500">{stage.model}</div>
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{stage.sub}</div>
                {evt && (isCurrent || isPast) && (
                  <div className="mt-2 text-xs text-zinc-700 font-mono">
                    {evt.current != null && evt.total != null
                      ? `[${evt.current}/${evt.total}] `
                      : ""}
                    {evt.message}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && review.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong className="font-semibold">Pipeline failed.</strong> {review.error}
        </div>
      )}

      {/* Adjustments table */}
      {calc && calc.adjustments.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Settlement adjustments</h2>
          <p className="mt-1 text-xs text-zinc-500">
            From the purchaser's perspective. Days shown as Vendor / Purchaser / Total.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3">V/P/Total days</th>
                  <th className="pb-2 pr-3">Side</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2">Citations</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                {calc.adjustments.map((a, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="py-1.5 pr-3">{a.description}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {a.daysVendor != null && a.daysPurchaser != null && a.totalDays != null
                        ? `${a.daysVendor}/${a.daysPurchaser}/${a.totalDays}`
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                          a.side === "debit"
                            ? "bg-red-50 text-red-900"
                            : "bg-emerald-50 text-emerald-900"
                        }`}
                      >
                        {a.side}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      ${fmt(a.amount.amount)}
                    </td>
                    <td className="py-1.5 text-xs text-zinc-600">
                      {a.citations
                        .map((c) => `${c.act.replace(/\(Vic\)/, "").trim()} s ${c.section}`)
                        .join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Stamp duty working */}
      {calc && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Stamp duty working — Duties Act 2000 (Vic)
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <DutyRow label="Dutiable value" amount={calc.stampDuty.dutiableValue.amount} />
            <DutyRow label="Base duty" amount={calc.stampDuty.baseDuty.amount} />
            {calc.stampDuty.pprConcession && (
              <DutyRow
                label="Less PPR concession"
                amount={-calc.stampDuty.pprConcession.amount}
              />
            )}
            {calc.stampDuty.fhbConcession && (
              <DutyRow
                label="Less FHB concession (Pt 5 Div 4A)"
                amount={-calc.stampDuty.fhbConcession.amount}
              />
            )}
            {calc.stampDuty.pensionerConcession && (
              <DutyRow
                label="Less pensioner concession"
                amount={-calc.stampDuty.pensionerConcession.amount}
              />
            )}
            {calc.stampDuty.foreignPurchaserAdditional && (
              <DutyRow
                label="Plus foreign purchaser additional (s 28A)"
                amount={calc.stampDuty.foreignPurchaserAdditional.amount}
              />
            )}
            <DutyRow
              label="Total payable"
              amount={calc.stampDuty.totalDutyPayable.amount}
              strong
            />
          </div>
          {calc.stampDuty.workingNotes.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-zinc-600">
              {calc.stampDuty.workingNotes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {findings.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            VIC settlement compliance · {findings.length} rules ({fails} fail · {warnings}{" "}
            warning)
          </h2>
          <ul className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {findings.map((f) => (
              <FindingRow key={f.ruleId} f={f} />
            ))}
          </ul>
        </section>
      )}

      {(docStream || review.document) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Settlement statement</h2>
            {!complete && (
              <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>
            )}
          </div>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800">
            {complete && review.document
              ? review.document.sections
                  .map((s) => `## ${s.heading}\n\n${s.markdown}`)
                  .join("\n\n")
              : docStream || "(statement pending)"}
          </pre>
          {complete && review.document && (
            <div className="mt-4 text-xs text-zinc-500">{review.document.date}</div>
          )}
        </section>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: ConveyanceFinding }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{f.title}</div>
        <div className="flex gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge(f.status)}`}
          >
            {f.status.replace(/_/g, " ")}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${severityBadge(f.severity)}`}
          >
            {f.severity}
          </span>
        </div>
      </div>
      <div className="mt-1 text-xs text-zinc-500 font-mono">{f.ruleId}</div>
      <p className="mt-2 text-sm text-zinc-700">{f.explanation}</p>
      {f.remediation && (
        <div className="mt-2 rounded bg-zinc-50 p-2 text-sm text-zinc-800 ring-1 ring-inset ring-zinc-200">
          <span className="font-semibold">Remediation: </span>
          {f.remediation}
        </div>
      )}
      {f.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f.citations.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-xs font-mono text-zinc-700 ring-1 ring-inset ring-zinc-200"
            >
              {c.act} s {c.section}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "strong";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div
        className={`text-base font-semibold ${tone === "strong" ? "text-zinc-900" : "text-zinc-800"}`}
      >
        {text}
      </div>
    </div>
  );
}

function DutyRow({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between rounded px-3 py-2 ${
        strong ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-800"
      }`}
    >
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm font-semibold">
        {amount < 0 ? "-" : ""}${fmt(Math.abs(amount))}
      </span>
    </div>
  );
}
