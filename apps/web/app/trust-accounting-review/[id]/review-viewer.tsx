"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  TrustAccountReview,
  TrustAccountReviewStatus,
  TrustComplianceFinding,
} from "@law/schema";

interface Stage {
  status: TrustAccountReviewStatus;
  label: string;
  sub: string;
  model: string;
}

const STAGES: Stage[] = [
  {
    status: "reconciling",
    label: "Reconcile cashbook + trust trial balance",
    sub: "Deterministic — cashbook ↔ bank ↔ ledger trial balance, overdrawn detection",
    model: "Pure JS",
  },
  {
    status: "checking_compliance",
    label: "Check LPUL Pt 4.2 + LPUGR rules",
    sub: "12 rules across s 142 / s 144 / s 145 / s 152 + LPUGR rr 35 / 36 / 38 / 47-53 / 65",
    model: "Claude Sonnet 4.6",
  },
  {
    status: "drafting_pack",
    label: "Draft monthly compliance pack",
    sub: "Trial balance + bank reconciliation + journals + breach register + principal certification",
    model: "Claude Opus 4.6",
  },
];

const STATUS_ORDER: Record<TrustAccountReviewStatus, number> = {
  pending: 0,
  reconciling: 1,
  checking_compliance: 2,
  drafting_pack: 3,
  complete: 4,
  signed_off: 4,
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

export function TrustAccountViewer({ initial }: { initial: TrustAccountReview }) {
  const [review, setReview] = useState<TrustAccountReview>(initial);
  const [packStream, setPackStream] = useState<string>("");
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/trust-accounting/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as TrustAccountReview);
        else if (data.type === "letter_chunk") setPackStream((p) => p + data.text);
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
  const complete = review.status === "complete" || review.status === "signed_off";
  const failed = review.status === "failed";

  const findings = review.findings ?? [];
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;
  const recon = review.reconciliation;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/trust-accounting" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; Trust accounting module
        </Link>
        <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
          Trust pack · {review.id.slice(0, 8)} · {review.input.periodStart} → {review.input.periodEnd}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
          {review.input.practice.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {review.input.bankStatement.bankName} · {review.input.bankStatement.bsb} ·{" "}
            {review.input.bankStatement.accountName}
          </span>
        </div>
      </header>

      {/* Headline stats */}
      {recon && (
        <section
          className={`rounded-xl border p-6 shadow-sm ${
            recon.reconciles && recon.overdrawnLedgers.length === 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Reconciliation outcome
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Reconciles?"
              text={recon.reconciles ? "Yes" : "NO"}
              tone={recon.reconciles ? "good" : "bad"}
            />
            <Stat
              label="Overdrawn ledgers"
              text={recon.overdrawnLedgers.length.toString()}
              tone={recon.overdrawnLedgers.length === 0 ? "good" : "bad"}
            />
            <Stat
              label="Cashbook closing"
              text={`$${fmt(recon.cashbookClosingBalance.amount)}`}
            />
            <Stat
              label="Trial balance total"
              text={`$${fmt(recon.trialBalanceTotal.amount)}`}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3">
            <div>cashbook − reconciled bank: ${fmt(recon.reconciliationDifference.amount)}</div>
            <div>trial − cashbook: ${fmt(recon.trialVsCashbookDifference.amount)}</div>
            <div>{recon.ledgerBalances.length} ledgers</div>
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

      {/* Ledger trial balance table */}
      {recon && recon.ledgerBalances.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Trust trial balance</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="pb-2 pr-3">Ledger</th>
                  <th className="pb-2 pr-3">Matter</th>
                  <th className="pb-2 pr-3 text-right">Opening</th>
                  <th className="pb-2 pr-3 text-right">Receipts</th>
                  <th className="pb-2 pr-3 text-right">Payments</th>
                  <th className="pb-2 pr-3 text-right">Tr in</th>
                  <th className="pb-2 pr-3 text-right">Tr out</th>
                  <th className="pb-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="font-mono text-zinc-800">
                {recon.ledgerBalances.map((l) => (
                  <tr
                    key={l.ledgerName}
                    className={l.isOverdrawn ? "bg-red-50 text-red-900" : ""}
                  >
                    <td className="py-1.5 pr-3 font-sans">{l.ledgerName}</td>
                    <td className="py-1.5 pr-3 text-xs">{l.matterRef}</td>
                    <td className="py-1.5 pr-3 text-right">${fmt(l.openingBalance.amount)}</td>
                    <td className="py-1.5 pr-3 text-right">${fmt(l.receipts.amount)}</td>
                    <td className="py-1.5 pr-3 text-right">${fmt(l.payments.amount)}</td>
                    <td className="py-1.5 pr-3 text-right">${fmt(l.transfersIn.amount)}</td>
                    <td className="py-1.5 pr-3 text-right">${fmt(l.transfersOut.amount)}</td>
                    <td className="py-1.5 text-right font-semibold">
                      ${fmt(l.closingBalance.amount)}
                      {l.isOverdrawn && (
                        <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-red-900">
                          overdrawn
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-300 font-semibold">
                  <td colSpan={7} className="pt-2 font-sans text-right pr-3">
                    Trial balance total
                  </td>
                  <td className="pt-2 text-right">
                    ${fmt(recon.trialBalanceTotal.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {findings.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            LPUL Pt 4.2 + LPUGR compliance · {findings.length} rules ({fails} fail · {warnings}{" "}
            warning)
          </h2>
          <ul className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {findings.map((f) => (
              <FindingRow key={f.ruleId} f={f} />
            ))}
          </ul>
        </section>
      )}

      {(packStream || review.pack) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Compliance pack</h2>
            {!complete && (
              <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>
            )}
          </div>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800">
            {complete && review.pack
              ? review.pack.sections
                  .map((s) => `## ${s.heading}\n\n${s.markdown}`)
                  .join("\n\n")
              : packStream || "(pack pending)"}
          </pre>
          {complete && review.pack && (
            <div className="mt-4 text-xs text-zinc-500">{review.pack.date}</div>
          )}
        </section>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: TrustComplianceFinding }) {
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
  tone?: "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-900"
      : tone === "bad"
        ? "text-red-900"
        : "text-zinc-900";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`text-base font-semibold ${toneClass}`}>{text}</div>
    </div>
  );
}
