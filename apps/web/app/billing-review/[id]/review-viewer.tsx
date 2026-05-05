"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  BillingFinding,
  BillingReview,
  BillingReviewStatus,
} from "@law/schema";

interface Stage {
  status: BillingReviewStatus;
  label: string;
  sub: string;
  model: string;
}

const STAGES: Stage[] = [
  {
    status: "computing_totals",
    label: "Compute fees, GST and amount due",
    sub: "Deterministic — fees + uplift + disbursements + GST − trust − prior paid",
    model: "Pure JS",
  },
  {
    status: "checking_compliance",
    label: "Check LPUL Pt 4.3 + tax invoice form",
    sub: "14 compliance rules across s 172 / s 182 / s 186 / s 187 / s 192 / s 193 / s 195 + GST Act s 29-70",
    model: "Claude Sonnet 4.6",
  },
  {
    status: "drafting_bill",
    label: "Draft tax invoice + cover letter",
    sub: "Streamed Markdown bill ready for solicitor sign-off (s 186)",
    model: "Claude Opus 4.6",
  },
];

const STATUS_ORDER: Record<BillingReviewStatus, number> = {
  pending: 0,
  computing_totals: 1,
  checking_compliance: 2,
  drafting_bill: 3,
  complete: 4,
  issued: 4,
  paid: 4,
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

export function BillingViewer({ initial }: { initial: BillingReview }) {
  const [review, setReview] = useState<BillingReview>(initial);
  const [docStream, setDocStream] = useState<string>("");
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/billing/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as BillingReview);
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
  const complete =
    review.status === "complete" ||
    review.status === "issued" ||
    review.status === "paid";
  const failed = review.status === "failed";

  const findings = review.findings ?? [];
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;
  const totals = review.totals;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/billing" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; Billing module
        </Link>
        <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
          Billing · bill {review.input.billNumber} · {review.id.slice(0, 8)}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
          {review.input.client.name}
        </h1>
        <div className="mt-1 text-sm text-zinc-600">
          Matter ref: <span className="font-mono">{review.input.matterRef}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {review.input.billKind.replace(/_/g, " ")}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            issued {review.input.issuedOn}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            due {review.input.dueOn}
          </span>
          {review.input.isConditional && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              conditional · uplift {review.input.upliftPercent ?? 0}%
            </span>
          )}
          {review.input.willWithdrawFromTrust && (
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900 ring-1 ring-inset ring-sky-200">
              trust withdrawal
            </span>
          )}
        </div>
      </header>

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

      {totals && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Computed totals</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm sm:grid-cols-4">
            <Stat label="Fees" value={totals.feesSubtotal.amount} />
            {totals.upliftAmount && (
              <Stat label="Uplift" value={totals.upliftAmount.amount} />
            )}
            <Stat label="Disb (GST)" value={totals.disbursementsGstable.amount} />
            <Stat label="Disb (no GST)" value={totals.disbursementsNonGstable.amount} />
            <Stat label="Subtotal ex GST" value={totals.subtotalExGst.amount} />
            <Stat label="GST" value={totals.gst.amount} />
            <Stat label="Total inc GST" value={totals.totalIncGst.amount} bold />
            {totals.trustOffset && (
              <Stat label="Trust offset" value={-totals.trustOffset.amount} />
            )}
            {totals.priorPaid && (
              <Stat label="Prior paid" value={-totals.priorPaid.amount} />
            )}
            <Stat label="Amount due" value={totals.amountDue.amount} bold />
          </div>
        </section>
      )}

      {findings.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            LPUL Pt 4.3 compliance · {findings.length} rules ({fails} fail · {warnings}{" "}
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
            <h2 className="text-lg font-semibold text-zinc-900">Bill + tax invoice</h2>
            {!complete && (
              <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>
            )}
          </div>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800">
            {complete && review.document
              ? review.document.sections
                  .map((s) => `## ${s.heading}\n\n${s.markdown}`)
                  .join("\n\n")
              : docStream || "(bill pending)"}
          </pre>
          {complete && review.document && (
            <div className="mt-4 text-xs text-zinc-500">{review.document.date}</div>
          )}
        </section>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: BillingFinding }) {
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

function Stat({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={bold ? "rounded bg-zinc-900 px-3 py-2 text-white" : ""}>
      <div
        className={`text-[10px] uppercase tracking-widest ${bold ? "text-zinc-300" : "text-zinc-500"}`}
      >
        {label}
      </div>
      <div className={bold ? "text-base font-semibold" : "text-sm text-zinc-800"}>
        ${fmt(value)}
      </div>
    </div>
  );
}
