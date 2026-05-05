"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FamilyProvisionRisk,
  WillBeneficiary,
  WillExecutor,
  WillExtraction,
  WillFinding,
  WillReview,
  WillReviewStatus,
  WillWitness,
} from "@law/schema";

interface Stage {
  status: WillReviewStatus;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

const STAGES: Stage[] = [
  {
    status: "classifying",
    label: "Classify the document",
    sub: "Formal will / codicil / informal s 9 / mutual / international",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract testator, executors, witnesses, beneficiaries",
    sub: "Including gift type, residue, BDBNs, attestation clause",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_validity",
    label: "Check validity",
    sub: "Wills Act 1997 (Vic) ss 5 / 7 / 8A / 9 / 13",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "analysing_family_provision",
    label: "Analyse family-provision exposure",
    sub: "AP Act 1958 (Vic) Pt IV — eligible-person classes",
    model: "Claude Sonnet 4.6",
    typical: "~1m",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a solicitor-reviewable letter",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<WillReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_validity: 3,
  analysing_family_provision: 4,
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

function executionStatusBadge(s: string): string {
  switch (s) {
    case "valid":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "informal_curable_s9":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "invalid":
      return "bg-red-100 text-red-900 ring-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

export function WillsReviewViewer({ initial }: { initial: WillReview }) {
  const [review, setReview] = useState<WillReview>(initial);
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
    const es = new EventSource(`/api/wills-review/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as WillReview);
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
  const findings = review.findings ?? [];
  const fpRisks = review.familyProvisionRisks ?? [];

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link href="/wills" className="text-sm text-zinc-500 hover:text-zinc-900">
            &larr; Wills module
          </Link>
          <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
            Will review · {review.id.slice(0, 8)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {extraction?.testator.name ?? "(testator pending)"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {extraction?.classification && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {extraction.classification.kind.replace(/_/g, " ")}
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${executionStatusBadge(review.executionStatus)}`}
            >
              execution: {review.executionStatus.replace(/_/g, " ")}
            </span>
            {extraction?.classification.isHomeMade && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                home-made
              </span>
            )}
            {extraction && !extraction.hasResidueClause && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                no residue clause
              </span>
            )}
          </div>
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
        <HeadlineBanner
          extraction={extraction}
          findings={findings}
          fpRisks={fpRisks}
          executionStatus={review.executionStatus}
        />
      )}

      {extraction && <ExtractionPanel extraction={extraction} />}

      {fpRisks.length > 0 && <FamilyProvisionPanel risks={fpRisks} />}

      {findings.length > 0 && <ValidityPanel findings={findings} />}

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
  findings,
  fpRisks,
  executionStatus,
}: {
  extraction: WillExtraction;
  findings: WillFinding[];
  fpRisks: FamilyProvisionRisk[];
  executionStatus: string;
}) {
  const fails = findings.filter((f) => f.status === "fail").length;
  const warnings = findings.filter((f) => f.status === "warning").length;
  const fpCritical = fpRisks.filter((r) => r.severity === "critical" || r.severity === "high");

  let tone: string;
  let label: string;
  if (executionStatus === "invalid" || fails > 0 || fpCritical.length > 0) {
    tone = "bg-red-50 ring-red-200";
    label = "INVALID OR HIGH-EXPOSURE — remediation required";
  } else if (
    executionStatus === "informal_curable_s9" ||
    warnings > 0 ||
    fpRisks.length > 0
  ) {
    tone = "bg-amber-50 ring-amber-200";
    label = "VALID WITH RESERVATIONS — review required";
  } else {
    tone = "bg-emerald-50 ring-emerald-200";
    label = "Likely VALID — solicitor confirmation required";
  }

  return (
    <div className={`rounded-xl ring-1 ring-inset ${tone} p-6`}>
      <div className="text-xs uppercase tracking-widest text-zinc-600">Headline assessment</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{label}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Validity fails" value={String(fails)} tone={fails > 0 ? "text-red-900" : "text-zinc-900"} />
        <Stat label="Validity warnings" value={String(warnings)} tone={warnings > 0 ? "text-amber-900" : "text-zinc-900"} />
        <Stat label="Pt IV exposures" value={String(fpRisks.length)} tone={fpCritical.length > 0 ? "text-red-900" : "text-zinc-900"} />
        <Stat label="Beneficiaries" value={String(extraction.beneficiaries.length)} />
      </div>
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

function ExtractionPanel({ extraction }: { extraction: WillExtraction }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Will particulars</h2>
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Testator</div>
          <Row label="Name" value={extraction.testator.name} />
          {extraction.testator.address && <Row label="Address" value={extraction.testator.address} />}
          {extraction.testator.dateOfBirth && <Row label="DOB" value={extraction.testator.dateOfBirth} />}
          {extraction.testator.occupation && <Row label="Occupation" value={extraction.testator.occupation} />}
          {extraction.testator.capacityNote && <Row label="Capacity note" value={extraction.testator.capacityNote} />}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Execution</div>
          <Row label="Execution date" value={extraction.executionDate ?? "—"} />
          <Row label="Place" value={extraction.placeOfExecution ?? "—"} />
          <Row
            label="Attestation clause"
            value={extraction.hasAttestationClause ? "present" : "MISSING"}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Executors ({extraction.executors.length})
        </div>
        {extraction.executors.length === 0 ? (
          <div className="text-sm text-red-900">No executor appointed.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {extraction.executors.map((e, i) => <ExecutorRow key={i} ex={e} />)}
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
            {extraction.witnesses.map((w, i) => <WitnessRow key={i} w={w} />)}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Beneficiaries ({extraction.beneficiaries.length})
        </div>
        {extraction.beneficiaries.length === 0 ? (
          <div className="text-sm text-zinc-500">No beneficiaries extracted.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {extraction.beneficiaries.map((b, i) => <BeneficiaryRow key={i} b={b} />)}
          </ul>
        )}
      </div>

      {extraction.hasResidueClause && extraction.residueDescription && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Residue</div>
          <blockquote className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 italic">
            {extraction.residueDescription}
          </blockquote>
        </div>
      )}

      {extraction.attestationClauseText && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
            Attestation clause (verbatim)
          </div>
          <blockquote className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 italic">
            {extraction.attestationClauseText}
          </blockquote>
        </div>
      )}

      {extraction.bindingDeathBenefitNominations.length > 0 && (
        <DetailList
          title="Binding death-benefit nominations"
          items={extraction.bindingDeathBenefitNominations}
        />
      )}
      {extraction.superFundsReferenced.length > 0 && (
        <DetailList title="Superannuation funds referenced" items={extraction.superFundsReferenced} />
      )}
      {extraction.testamentaryTrustsReferenced.length > 0 && (
        <DetailList
          title="Testamentary trusts"
          items={extraction.testamentaryTrustsReferenced}
        />
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

function ExecutorRow({ ex }: { ex: WillExecutor }) {
  return (
    <li className="px-4 py-3 flex items-baseline justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-zinc-900">{ex.name}</div>
        {ex.relationshipToTestator && (
          <div className="text-xs text-zinc-500">{ex.relationshipToTestator}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 justify-end">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
          {ex.role}
        </span>
        {ex.isBeneficiary && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
            also beneficiary
          </span>
        )}
        {ex.remunerationProvided && (
          <span className="inline-flex items-center rounded-full bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
            remuneration
          </span>
        )}
      </div>
    </li>
  );
}

function WitnessRow({ w }: { w: WillWitness }) {
  return (
    <li className="px-4 py-3 flex items-baseline justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-zinc-900">{w.name}</div>
        {w.occupation && <div className="text-xs text-zinc-500">{w.occupation}</div>}
      </div>
      {w.isBeneficiaryOrSpouseOfBeneficiary && (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900 ring-1 ring-inset ring-red-200">
          interested witness (s 13)
        </span>
      )}
    </li>
  );
}

function BeneficiaryRow({ b }: { b: WillBeneficiary }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{b.name}</div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            {b.giftType}
          </span>
          {b.isContingent && (
            <span className="inline-flex items-center rounded-full bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              contingent
            </span>
          )}
          {b.ademptionRisk && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              ademption risk
            </span>
          )}
          {b.isEligibleAPActPt4 && (
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900 ring-1 ring-inset ring-sky-200">
              Pt IV eligible
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 text-xs text-zinc-700 italic">&ldquo;{b.description}&rdquo;</div>
      {b.relationshipToTestator && (
        <div className="mt-1 text-xs text-zinc-500">relationship: {b.relationshipToTestator}</div>
      )}
      {b.isContingent && b.contingencyDescription && (
        <div className="mt-1 text-xs text-zinc-500">
          contingency: {b.contingencyDescription}
        </div>
      )}
    </li>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{title}</div>
      <ul className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-1.5 text-sm text-zinc-800 list-disc pl-5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ValidityPanel({ findings }: { findings: WillFinding[] }) {
  const sorted = useMemo(
    () =>
      [...findings].sort((a, b) => {
        const ord = (s: string) => (s === "fail" ? 0 : s === "warning" ? 1 : s === "needs_review" ? 2 : 3);
        if (ord(a.status) !== ord(b.status)) return ord(a.status) - ord(b.status);
        return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      }),
    [findings],
  );

  const counts = {
    pass: findings.filter((f) => f.status === "pass").length,
    fail: findings.filter((f) => f.status === "fail").length,
    warning: findings.filter((f) => f.status === "warning").length,
    needs_review: findings.filter((f) => f.status === "needs_review").length,
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">
        Validity findings (Wills Act 1997 (Vic))
      </h2>
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
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                  {f.category.replace(/_/g, " ")}
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
        ))}
      </ul>
    </section>
  );
}

function FamilyProvisionPanel({ risks }: { risks: FamilyProvisionRisk[] }) {
  const sorted = useMemo(
    () =>
      [...risks].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)),
    [risks],
  );
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-amber-900">
          Family-provision exposure · AP Act 1958 (Vic) Pt IV
        </h2>
        <span className="text-xs text-amber-800">requires solicitor confirmation</span>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        Pt IV exposure turns on the moral-duty assessment in Vigolo v Bostin (2005) and is
        sensitive to family circumstances not visible from the will alone. Consider preparing
        a statement of reasons and reviewing super / non-estate asset planning.
      </p>
      <ul className="mt-4 space-y-3">
        {sorted.map((r, i) => (
          <li key={i} className="rounded-md border border-amber-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">{r.eligiblePerson}</div>
              <div className="flex gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${severityBadge(r.severity)}`}
                >
                  {r.severity}
                </span>
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                  {r.eligibilityCategory.replace(/_/g, " ")}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-700">{r.reasoning}</p>
            {r.estimatedExposure && (
              <div className="mt-2 text-sm text-zinc-700">
                <span className="font-semibold">Estimated exposure: </span>
                {r.estimatedExposure}
              </div>
            )}
            {r.mitigations.length > 0 && (
              <div className="mt-2">
                <div className="text-xs uppercase tracking-widest text-zinc-500">Mitigations</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800 space-y-0.5">
                  {r.mitigations.map((m, j) => (
                    <li key={j}>{m}</li>
                  ))}
                </ul>
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
  letter: WillReview["letter"] | null;
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
        {!complete && <span className="text-xs text-zinc-500 animate-pulse">streaming…</span>}
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
