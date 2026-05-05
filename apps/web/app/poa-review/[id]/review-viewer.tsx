"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PoaAttorney,
  PoaComplianceFinding,
  PoaExtraction,
  PoaRedFlag,
  PoaReview,
  PoaReviewStatus,
  PoaWitness,
} from "@law/schema";

interface Stage {
  status: PoaReviewStatus;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

const STAGES: Stage[] = [
  {
    status: "classifying",
    label: "Classify the instrument",
    sub: "Kind / scope / prescribed-form / appointment mode",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract parties, witnesses, scope",
    sub: "Principal · attorneys · witnesses · gift / conflict authorisations",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_validity",
    label: "Check validity",
    sub: "PoA Act 2014 (Vic) ss 22 / 31 / 33 / 35 / 41 / 44 / 64 / 65",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "detecting_red_flags",
    label: "Detect red flags",
    sub: "Capacity · undue influence · self-dealing · elder abuse · deadlock",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a solicitor-reviewable letter with VCAT review options",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<PoaReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_validity: 3,
  detecting_red_flags: 4,
  composing_letter: 5,
  complete: 6,
  failed: -1,
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

interface ProgressEvent {
  message: string;
  current?: number;
  total?: number;
  pass: number;
}

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

function severityBadge(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-red-100 text-red-900 ring-red-200";
    case "high":
      return "bg-orange-100 text-orange-900 ring-orange-200";
    case "medium":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "low":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-zinc-50 text-zinc-600 ring-zinc-200";
  }
}

function statusBadge(status: string): string {
  switch (status) {
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

export function PoaReviewViewer({ initial }: { initial: PoaReview }) {
  const [review, setReview] = useState<PoaReview>(initial);
  const [letterStream, setLetterStream] = useState<string>("");
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const [now, setNow] = useState<number>(Date.now());
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (review.status === "complete" || review.status === "failed") return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [review.status]);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/poa-review/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as PoaReview);
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
  const complete = review.status === "complete";
  const failed = review.status === "failed";
  const totalElapsedSec = Math.max(
    0,
    Math.floor((now - new Date(review.createdAt).getTime()) / 1000),
  );

  const extraction = review.extraction;
  const validity = review.compliance ?? [];
  const redFlags = review.redFlags ?? [];

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link href="/poa" className="text-sm text-zinc-500 hover:text-zinc-900">
            &larr; PoA module
          </Link>
          <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
            PoA review · {review.id.slice(0, 8)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {extraction?.principal.name ?? "(principal pending)"}
          </h1>
          {extraction?.classification && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {extraction.classification.kind.replace(/_/g, " ")}
              </span>
              {extraction.classification.isEnduring && (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 ring-1 ring-inset ring-indigo-200">
                  enduring
                </span>
              )}
              {extraction.classification.scopeFinancial && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  financial
                </span>
              )}
              {extraction.classification.scopePersonal && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  personal
                </span>
              )}
              {extraction.classification.scopeMedical && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  medical
                </span>
              )}
              {extraction.classification.formIsStatutoryPrescribed ? (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                  prescribed form
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                  non-prescribed form
                </span>
              )}
              {extraction.classification.multipleAttorneys && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                  {extraction.classification.appointmentMode.replace(/_/g, " ")} attorneys
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Elapsed</div>
          <div className="text-2xl font-mono text-zinc-900">{fmtMs(totalElapsedSec * 1000)}</div>
        </div>
      </header>

      <Stepper stageIdx={stageIdx} progressByPass={progressByPass} failed={failed} />

      {failed && review.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong className="font-semibold">Pipeline failed.</strong> {review.error}
        </div>
      )}

      {complete && extraction && (
        <HeadlineBanner extraction={extraction} validity={validity} redFlags={redFlags} />
      )}

      {extraction && <ExtractionPanel extraction={extraction} />}

      {redFlags.length > 0 && <RedFlagsPanel redFlags={redFlags} />}

      {validity.length > 0 && <ValidityPanel validity={validity} />}

      {(letterStream || review.letter) && (
        <LetterPanel
          streaming={letterStream}
          letter={review.letter ?? null}
          complete={complete}
        />
      )}
    </div>
  );
}

function Stepper({
  stageIdx,
  progressByPass,
  failed,
}: {
  stageIdx: number;
  progressByPass: Record<number, ProgressEvent>;
  failed: boolean;
}) {
  return (
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
                <div className="text-xs text-zinc-500">
                  {stage.model} · {stage.typical}
                </div>
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
  );
}

function HeadlineBanner({
  extraction,
  validity,
  redFlags,
}: {
  extraction: PoaExtraction;
  validity: PoaComplianceFinding[];
  redFlags: PoaRedFlag[];
}) {
  const fails = validity.filter((v) => v.status === "fail").length;
  const warnings = validity.filter((v) => v.status === "warning").length;
  const critical = redFlags.filter((r) => r.severity === "critical" || r.severity === "high");
  const acceptanceMissing = extraction.attorneys.filter((a) => !a.acceptanceSigned).length;

  let verdict: "valid" | "partial" | "invalid";
  let tone: string;
  let label: string;
  if (fails > 0 || critical.length > 0) {
    verdict = "invalid";
    tone = "bg-red-50 ring-red-200";
    label = "Likely INVALID — formal defects or critical red flags";
  } else if (warnings > 0 || redFlags.length > 0 || acceptanceMissing > 0) {
    verdict = "partial";
    tone = "bg-amber-50 ring-amber-200";
    label = "PARTIALLY VALID — remediation required";
  } else {
    verdict = "valid";
    tone = "bg-emerald-50 ring-emerald-200";
    label = "Likely VALID — solicitor confirmation required";
  }

  return (
    <div className={`rounded-xl ring-1 ring-inset ${tone} p-6`}>
      <div className="text-xs uppercase tracking-widest text-zinc-600">Headline assessment</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{label}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Validity fails"
          value={String(fails)}
          tone={fails > 0 ? "text-red-900" : "text-zinc-900"}
        />
        <Stat
          label="Validity warnings"
          value={String(warnings)}
          tone={warnings > 0 ? "text-amber-900" : "text-zinc-900"}
        />
        <Stat
          label="Red flags"
          value={String(redFlags.length)}
          tone={critical.length > 0 ? "text-red-900" : "text-zinc-900"}
        />
        <Stat
          label="Acceptance missing"
          value={String(acceptanceMissing)}
          tone={acceptanceMissing > 0 ? "text-amber-900" : "text-zinc-900"}
        />
      </div>
      {verdict !== "valid" && (
        <p className="mt-4 text-sm text-zinc-700">
          The supervising solicitor must review and confirm before any advice is given to the
          client. Where capacity, undue influence, or self-dealing is suspected, consider an
          application to VCAT under PoA Act 2014 (Vic) Pt 7.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-zinc-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function ExtractionPanel({ extraction }: { extraction: PoaExtraction }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Instrument particulars</h2>
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Principal</div>
          <Row label="Name" value={extraction.principal.name} />
          {extraction.principal.address && (
            <Row label="Address" value={extraction.principal.address} />
          )}
          {extraction.principal.dateOfBirth && (
            <Row label="DOB" value={extraction.principal.dateOfBirth} />
          )}
          {extraction.principal.capacityNote && (
            <Row label="Capacity note" value={extraction.principal.capacityNote} />
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Execution</div>
          <Row label="Execution date" value={extraction.executionDate ?? "—"} />
          <Row
            label="Effective trigger"
            value={extraction.effectiveTrigger.replace(/_/g, " ")}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Attorneys ({extraction.attorneys.length})
        </div>
        {extraction.attorneys.length === 0 ? (
          <div className="text-sm text-zinc-500">No attorneys extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {extraction.attorneys.map((a, i) => (
              <AttorneyRow key={i} attorney={a} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Witnesses ({extraction.witnesses.length})
        </div>
        {extraction.witnesses.length === 0 ? (
          <div className="text-sm text-zinc-500">No witnesses extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {extraction.witnesses.map((w, i) => (
              <WitnessRow key={i} witness={w} />
            ))}
          </ul>
        )}
      </div>

      {extraction.scopeDescription && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Scope clause</div>
          <blockquote className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 italic">
            {extraction.scopeDescription}
          </blockquote>
        </div>
      )}

      {extraction.conditionsAndLimitations.length > 0 && (
        <DetailList title="Conditions / limitations" items={extraction.conditionsAndLimitations} />
      )}
      {extraction.giftAuthorisations.length > 0 && (
        <DetailList
          title={`Gift authorisations · ${extraction.giftAuthorisations.length} (s 65)`}
          items={extraction.giftAuthorisations}
          tone="amber"
        />
      )}
      {extraction.conflictTransactionAuthorisations.length > 0 && (
        <DetailList
          title={`Conflict-transaction authorisations · ${extraction.conflictTransactionAuthorisations.length} (s 64)`}
          items={extraction.conflictTransactionAuthorisations}
          tone="amber"
        />
      )}
      {extraction.remunerationProvisions.length > 0 && (
        <DetailList
          title={`Attorney remuneration (s 70) · ${extraction.remunerationProvisions.length}`}
          items={extraction.remunerationProvisions}
        />
      )}
      {extraction.revocationClauses.length > 0 && (
        <DetailList title="Revocation clauses" items={extraction.revocationClauses} />
      )}
      {extraction.observations.length > 0 && (
        <DetailList title="Other observations" items={extraction.observations} />
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <div className="text-zinc-500">{label}</div>
      <div className="col-span-2 text-zinc-900">{value}</div>
    </div>
  );
}

function AttorneyRow({ attorney: a }: { attorney: PoaAttorney }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{a.name}</div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {a.role}
          </span>
          {a.acceptanceSigned ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
              acceptance signed
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900 ring-1 ring-inset ring-red-200">
              acceptance MISSING (s 41)
            </span>
          )}
          {a.conflictOfInterestDisclosed && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              conflict disclosed
            </span>
          )}
        </div>
      </div>
      {(a.relationshipToPrincipal || a.acceptanceDate) && (
        <div className="mt-1 text-xs text-zinc-500">
          {a.relationshipToPrincipal && <>relationship: {a.relationshipToPrincipal}</>}
          {a.relationshipToPrincipal && a.acceptanceDate && " · "}
          {a.acceptanceDate && <>signed: {a.acceptanceDate}</>}
        </div>
      )}
      {a.conflictOfInterestDescription && (
        <div className="mt-1 text-xs text-zinc-700 italic">
          &ldquo;{a.conflictOfInterestDescription}&rdquo;
        </div>
      )}
    </li>
  );
}

function WitnessRow({ witness: w }: { witness: PoaWitness }) {
  const irregular = w.qualification === "other" || w.qualification === "unknown";
  return (
    <li className="px-4 py-3 flex items-baseline justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-zinc-900">{w.name}</div>
        {w.signatureDate && (
          <div className="text-xs text-zinc-500">signed {w.signatureDate}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 justify-end">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            irregular
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : "bg-zinc-100 text-zinc-700 ring-zinc-200"
          }`}
        >
          {w.qualification.replace(/_/g, " ")}
        </span>
        {w.certificateOfWitnessIncluded ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            certificate ✓
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
            no certificate
          </span>
        )}
      </div>
    </li>
  );
}

function DetailList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "amber";
}) {
  const wrapper =
    tone === "amber"
      ? "rounded-md border border-amber-200 bg-amber-50 p-3"
      : "rounded-md border border-zinc-200 bg-zinc-50 p-3";
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{title}</div>
      <ul className={`${wrapper} space-y-1.5 text-sm text-zinc-800 list-disc pl-5`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ValidityPanel({ validity }: { validity: PoaComplianceFinding[] }) {
  const sorted = useMemo(
    () =>
      [...validity].sort((a, b) => {
        const orderA = a.status === "fail" ? 0 : a.status === "warning" ? 1 : a.status === "needs_review" ? 2 : 3;
        const orderB = b.status === "fail" ? 0 : b.status === "warning" ? 1 : b.status === "needs_review" ? 2 : 3;
        if (orderA !== orderB) return orderA - orderB;
        return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      }),
    [validity],
  );

  const counts = {
    pass: validity.filter((v) => v.status === "pass").length,
    fail: validity.filter((v) => v.status === "fail").length,
    warning: validity.filter((v) => v.status === "warning").length,
    needs_review: validity.filter((v) => v.status === "needs_review").length,
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Validity findings (PoA Act 2014 (Vic))</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pass" value={String(counts.pass)} tone="text-emerald-800" />
        <Stat label="Fail" value={String(counts.fail)} tone="text-red-900" />
        <Stat label="Warning" value={String(counts.warning)} tone="text-amber-900" />
        <Stat label="Needs review" value={String(counts.needs_review)} tone="text-sky-800" />
      </div>
      <ul className="mt-6 divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {sorted.map((f) => (
          <li key={f.ruleId} className="px-4 py-3">
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
        ))}
      </ul>
    </section>
  );
}

function RedFlagsPanel({ redFlags }: { redFlags: PoaRedFlag[] }) {
  const sorted = useMemo(
    () =>
      [...redFlags].sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
      ),
    [redFlags],
  );
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-red-900">
          Red flags · equity / fiduciary / abuse overlay
        </h2>
        <span className="text-xs text-red-800">
          requires solicitor confirmation
        </span>
      </div>
      <p className="mt-1 text-sm text-red-800">
        Red flags are not pure compliance failures — they are signals that may engage the equity
        / fiduciary jurisdiction (Yerkey, Bridgewater v Leahy, Banks v Goodfellow analogues), or
        warrant an application to VCAT under PoA Act 2014 (Vic) Pt 7.
      </p>
      <ul className="mt-4 space-y-3">
        {sorted.map((rf) => (
          <li key={rf.id} className="rounded-md border border-red-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">{rf.title}</div>
              <div className="flex gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${severityBadge(rf.severity)}`}
                >
                  {rf.severity}
                </span>
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                  {rf.category.replace(/_/g, " ")}
                </span>
                {rf.needsLawyerConfirm && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                    lawyer confirm
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-700">{rf.explanation}</p>
            {rf.signals.length > 0 && (
              <div className="mt-2">
                <div className="text-xs uppercase tracking-widest text-zinc-500">Signals</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800 space-y-0.5">
                  {rf.signals.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {rf.evidence.length > 0 && (
              <div className="mt-2">
                <div className="text-xs uppercase tracking-widest text-zinc-500">Evidence</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800 italic space-y-0.5">
                  {rf.evidence.map((s, i) => (
                    <li key={i}>&ldquo;{s}&rdquo;</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 rounded bg-zinc-50 p-3 text-sm text-zinc-800 ring-1 ring-inset ring-zinc-200">
              <span className="font-semibold">Recommended action: </span>
              {rf.recommendedAction}
            </div>
            {rf.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rf.citations.map((c, i) => (
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
        ))}
      </ul>
    </section>
  );
}

function LetterPanel({
  streaming,
  letter,
  complete,
}: {
  streaming: string;
  letter: PoaReview["letter"] | null;
  complete: boolean;
}) {
  const body =
    complete && letter
      ? letter.sections.map((s) => `## ${s.heading}\n\n${s.markdown}`).join("\n\n")
      : streaming;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Letter of advice</h2>
        {!complete && (
          <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>
        )}
      </div>
      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800">
        {body || "(letter pending)"}
      </pre>
      {complete && letter && (
        <div className="mt-4 text-xs text-zinc-500">
          {letter.date} · {letter.clientName} ({letter.clientRole.replace(/_/g, " ")})
        </div>
      )}
    </section>
  );
}
