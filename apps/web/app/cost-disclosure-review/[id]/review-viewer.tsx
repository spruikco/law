"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  CostDisclosureFinding,
  CostDisclosureReview,
  CostDisclosureReviewStatus,
} from "@law/schema";

interface Stage {
  status: CostDisclosureReviewStatus;
  label: string;
  sub: string;
  model: string;
}

const STAGES: Stage[] = [
  {
    status: "checking_compliance",
    label: "Check LPUL s 174 mandatory elements",
    sub: "11 mandatory disclosure rules",
    model: "Claude Sonnet 4.6",
  },
  {
    status: "drafting_letter",
    label: "Draft cost disclosure letter",
    sub: "Streamed Markdown letter ready for solicitor sign-off",
    model: "Claude Opus 4.6",
  },
];

const STATUS_ORDER: Record<CostDisclosureReviewStatus, number> = {
  pending: 0,
  checking_compliance: 1,
  drafting_letter: 2,
  complete: 3,
  issued: 3,
  accepted: 3,
  superseded: 3,
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

export function CostDisclosureViewer({ initial }: { initial: CostDisclosureReview }) {
  const [review, setReview] = useState<CostDisclosureReview>(initial);
  const [letterStream, setLetterStream] = useState<string>("");
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/cost-disclosure/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as CostDisclosureReview);
        else if (data.type === "letter_chunk") setLetterStream((p) => p + data.text);
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
    review.status === "accepted";
  const failed = review.status === "failed";

  const findings = review.findings ?? [];
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/cost-disclosure" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; Cost disclosure module
        </Link>
        <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
          Cost disclosure · {review.id.slice(0, 8)}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
          {review.input.client.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {review.input.matterType.replace(/_/g, " ")}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {review.input.feeBasis} fee basis
          </span>
          {review.input.isConditional && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              conditional · uplift {review.input.upliftPercent ?? 0}%
            </span>
          )}
          {review.input.isSophisticatedClient && (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
              sophisticated client (s 174(4))
            </span>
          )}
        </div>
      </header>

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

      {findings.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            LPUL s 174 compliance · {findings.length} elements ({fails} fail · {warnings}{" "}
            warning)
          </h2>
          <ul className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {findings.map((f) => (
              <FindingRow key={f.ruleId} f={f} />
            ))}
          </ul>
        </section>
      )}

      {(letterStream || review.letter) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Cost disclosure letter</h2>
            {!complete && (
              <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>
            )}
          </div>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800">
            {complete && review.letter
              ? review.letter.sections
                  .map((s) => `## ${s.heading}\n\n${s.markdown}`)
                  .join("\n\n")
              : letterStream || "(letter pending)"}
          </pre>
          {complete && review.letter && (
            <div className="mt-4 text-xs text-zinc-500">{review.letter.date}</div>
          )}
        </section>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: CostDisclosureFinding }) {
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
