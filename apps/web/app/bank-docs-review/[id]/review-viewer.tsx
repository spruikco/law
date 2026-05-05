"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BankDocComplianceFinding,
  BankDocProvision,
  BankDocsExtractionBundle,
  BankDocsReview,
  BankDocsReviewStatus,
  BankUnenforceabilityFinding,
  CovenantSummary,
  CrossDefaultMap,
  FeeLadderRow,
  RegulatoryHook,
  RepaymentScenario,
} from "@law/schema";

interface Stage {
  status: BankDocsReviewStatus;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

const STAGES: Stage[] = [
  {
    status: "classifying",
    label: "Classify NCC / ACL UCT / third-party guarantee",
    sub: "NCC s5 + ACL Pt 2-3 + Banking Code triggers",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract facility, guarantee, default, NCC, PPSA",
    sub: "Parallel tool use across the document set",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_compliance",
    label: "Compliance + unenforceability",
    sub: "NCC / ACL / Banking Code / PPSA + unjust transactions, Garcia, Amadio, UCT",
    model: "Claude Sonnet 4.6",
    typical: "~2m",
  },
  {
    status: "analysing_clauses",
    label: "Analyse borrower-adverse clauses",
    sub: "Classify each clause; draft polite-but-firm redlines",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
  {
    status: "synthesising_capabilities",
    label: "Synthesise repayments, fees, covenants, regulatory hooks",
    sub: "Rate shocks, IO→P&I switch, fee ladder, cross-default map",
    model: "Deterministic",
    typical: "~5s",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a borrower-/guarantor-protective letter",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<BankDocsReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_compliance: 3,
  analysing_clauses: 4,
  synthesising_capabilities: 5,
  composing_letter: 6,
  complete: 7,
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

function fmtAud(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
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

export function BankDocsReviewViewer({ initial }: { initial: BankDocsReview }) {
  const [review, setReview] = useState<BankDocsReview>(initial);
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
    const es = new EventSource(`/api/bank-docs-review/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "review") setReview(data.review as BankDocsReview);
        else if (data.type === "letter_chunk")
          setLetterStream((prev) => prev + data.text);
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

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link href="/bank-docs" className="text-sm text-zinc-500 hover:text-zinc-900">
            &larr; Bank documents module
          </Link>
          <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
            Bank docs review · {review.id.slice(0, 8)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {extraction?.particulars.borrowerName ?? extraction?.particulars.parties[0]?.name ?? "(borrower pending)"}
          </h1>
          {extraction?.classification && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {extraction.classification.kind.replace(/_/g, " ")}
              </span>
              {extraction.classification.isConsumerCredit && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  NCC applies
                </span>
              )}
              {extraction.classification.isUnfairContractTermsRegime && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">
                  ACL UCT regime
                </span>
              )}
              {extraction.classification.isThirdPartyGuarantee && (
                <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-900 ring-1 ring-inset ring-orange-200">
                  Third-party guarantee — Garcia risk
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right text-sm text-zinc-500">
          <div>
            Total <span className="font-mono tabular-nums">{fmtMs(totalElapsedSec * 1000)}</span>
          </div>
          {!complete && !failed && (
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span>Live</span>
            </div>
          )}
        </div>
      </header>

      {failed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Pipeline failed</div>
          <div className="mt-1">{review.error ?? "Unknown error"}</div>
        </div>
      )}

      {complete && <HeadlineBanner review={review} />}

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Pipeline
        </h2>
        <ol className="mt-4 space-y-3">
          {STAGES.map((s, i) => {
            const passNumber = i + 1;
            const isPast = stageIdx > i + 1 || complete;
            const isActive = stageIdx === i + 1 && !complete && !failed;
            const isPending = stageIdx < i + 1 && !complete;
            const prog = progressByPass[passNumber];
            return (
              <li key={s.status} className="flex gap-3">
                <div
                  className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border text-center text-xs leading-[1.35rem] ${
                    isPast
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isActive
                        ? "border-zinc-900 bg-white text-zinc-900"
                        : "border-zinc-300 bg-white text-zinc-400"
                  }`}
                >
                  {isPast ? "✓" : passNumber}
                </div>
                <div className="flex-1">
                  <div
                    className={`text-sm font-medium ${
                      isPending ? "text-zinc-400" : "text-zinc-900"
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {s.sub} · {s.model} · {s.typical}
                  </div>
                  {isActive && prog && (
                    <div className="mt-1 text-xs text-zinc-600">
                      {prog.message}
                      {prog.total != null && prog.current != null && (
                        <span className="ml-2 font-mono tabular-nums text-zinc-400">
                          {prog.current}/{prog.total}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {extraction && <ExtractionPanel extraction={extraction} />}
      {extraction?.provisions && extraction.provisions.length > 0 && (
        <ProvisionsPanel provisions={extraction.provisions} />
      )}
      {review.unenforceability.length > 0 && (
        <UnenforceabilityPanel findings={review.unenforceability} />
      )}
      {review.compliance.length > 0 && (
        <CompliancePanel findings={review.compliance} />
      )}
      {review.repaymentScenarios.length > 0 && (
        <RepaymentScenariosPanel scenarios={review.repaymentScenarios} />
      )}
      {review.feeLadder.length > 0 && <FeeLadderPanel rows={review.feeLadder} />}
      {review.covenants.length > 0 && <CovenantsPanel covenants={review.covenants} />}
      {review.crossDefault?.hasCrossDefault && (
        <CrossDefaultPanel map={review.crossDefault} />
      )}
      {review.regulatoryHooks.length > 0 && (
        <RegulatoryHooksPanel hooks={review.regulatoryHooks} />
      )}
      {(review.letter || letterStream) && (
        <LetterPanel
          letter={review.letter}
          stream={letterStream}
          complete={complete}
        />
      )}
    </div>
  );
}

function HeadlineBanner({ review }: { review: BankDocsReview }) {
  const totalExposure = review.unenforceability
    .filter((u) => typeof u.estimatedExposureAud === "number")
    .reduce((acc, u) => acc + (u.estimatedExposureAud ?? 0), 0);
  const criticalUnenf = review.unenforceability.filter(
    (u) => u.severity === "critical" || u.severity === "high",
  ).length;
  const failCompliance = review.compliance.filter((c) => c.status === "fail").length;
  const uctCandidates = review.extraction?.provisions.filter((p) => p.uctCandidate).length ?? 0;

  let verdict = "Standard pack — minor amendments only";
  let tone = "bg-emerald-50 ring-emerald-200 text-emerald-900";
  if (criticalUnenf > 0 || failCompliance > 2) {
    verdict = "Material lender non-compliance / unenforceable terms — prioritise renegotiation";
    tone = "bg-red-50 ring-red-200 text-red-900";
  } else if (failCompliance > 0 || uctCandidates > 2) {
    verdict = "Compliance / UCT issues to address before signing";
    tone = "bg-amber-50 ring-amber-200 text-amber-900";
  }

  return (
    <section className={`rounded-xl ring-1 ring-inset p-6 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-widest opacity-70">
        Headline risk
      </div>
      <div className="mt-1 text-lg font-semibold">{verdict}</div>
      <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {review.unenforceability.length}
          </div>
          <div className="opacity-80">Unenforceability findings</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {fmtAud(totalExposure)}
          </div>
          <div className="opacity-80">Quantified exposure</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {failCompliance}
          </div>
          <div className="opacity-80">Compliance fails</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {uctCandidates}
          </div>
          <div className="opacity-80">ACL UCT candidates</div>
        </div>
      </div>
    </section>
  );
}

function ExtractionPanel({ extraction }: { extraction: BankDocsExtractionBundle }) {
  const p = extraction.particulars;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Facility particulars
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
        <Row label="Lender" value={p.lenderName} />
        <Row label="Borrower" value={p.borrowerName} />
        <Row label="Amount" value={p.facilityAmount?.raw} />
        <Row label="Kind" value={p.facilityKind?.replace(/_/g, " ")} />
        <Row label="Purpose" value={p.purpose} />
        <Row label="Governing law" value={p.governingLaw} />
        {p.interestRate && (
          <>
            <Row
              label="Interest rate"
              value={`${p.interestRate.type}${p.interestRate.initialRatePct ? ` · ${p.interestRate.initialRatePct}%` : ""}`}
            />
            <Row label="Default rate" value={p.interestRate.defaultRatePct ? `${p.interestRate.defaultRatePct}%` : "—"} />
          </>
        )}
        {p.repayment && (
          <>
            <Row label="Repayment" value={p.repayment.frequency} />
            <Row label="Term (months)" value={p.repayment.termMonths?.toString()} />
          </>
        )}
      </dl>

      {p.securities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Securities ({p.securities.length})
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {p.securities.map((s, i) => (
              <li key={i} className="px-4 py-3 text-sm">
                <div className="font-medium text-zinc-900">
                  {s.kind.replace(/_/g, " ")} —{" "}
                  <span className="font-normal text-zinc-700">{s.description}</span>
                </div>
                {s.detail && <div className="mt-1 text-xs text-zinc-500">{s.detail}</div>}
                <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                  {s.capAmount && <span>cap {s.capAmount.raw}</span>}
                  {s.crossCollateralised && (
                    <span className="text-orange-700">cross-collateralised</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extraction.guarantee.present && (
        <div className="mt-6 rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <div className="font-semibold">Guarantee assessment</div>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <div>Guarantors: {extraction.guarantee.guarantors.join(", ") || "—"}</div>
            <div>
              Capped: {extraction.guarantee.capped ? "yes" : "NO (uncapped)"}
              {extraction.guarantee.capAmount ? ` (${extraction.guarantee.capAmount.raw})` : ""}
            </div>
            <div>
              Principal-debtor clause:{" "}
              {extraction.guarantee.principalDebtorClause ? "PRESENT — Yerkey/Garcia equity defeated" : "absent"}
            </div>
            <div>
              ILA required:{" "}
              {extraction.guarantee.independentLegalAdviceRequired ? "yes" : "no"}{" "}
              {extraction.guarantee.ilaCertificateAttached ? "(certificate attached)" : ""}
            </div>
          </div>
          {extraction.guarantee.garciaRiskFlags.length > 0 && (
            <div className="mt-2">
              <div className="font-medium">Garcia risk flags:</div>
              <ul className="ml-4 list-disc">
                {extraction.guarantee.garciaRiskFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.guarantee.codeOfBankingPracticeIssues.length > 0 && (
            <div className="mt-2">
              <div className="font-medium">Banking Code 2025 issues:</div>
              <ul className="ml-4 list-disc">
                {extraction.guarantee.codeOfBankingPracticeIssues.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 pb-2 last:border-b-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-900 text-right">{value || "—"}</dd>
    </div>
  );
}

function ProvisionsPanel({ provisions }: { provisions: BankDocProvision[] }) {
  const nonStandard = provisions.filter((p) => p.classification !== "standard");
  const sorted = [...nonStandard].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Borrower-adverse / unusual clauses ({sorted.length} of {provisions.length})
      </h2>
      <div className="mt-4 space-y-3">
        {sorted.map((p, i) => (
          <details
            key={i}
            className="rounded-lg border border-zinc-200 px-4 py-3 [&_summary]:cursor-pointer"
          >
            <summary className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-zinc-500">{p.number}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${severityBadge(p.severity)}`}
              >
                {p.severity}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {p.classification.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-zinc-500">{p.focusArea.replace(/_/g, " ")}</span>
              {p.uctCandidate && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-900 ring-1 ring-inset ring-blue-200">
                  UCT candidate
                </span>
              )}
              <span className="ml-2 truncate text-zinc-900">{p.summary}</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-md bg-zinc-50 p-3 font-mono text-xs text-zinc-800 whitespace-pre-wrap">
                {p.fullText}
              </div>
              <div>
                <span className="font-medium text-zinc-700">Borrower impact:</span>{" "}
                <span className="text-zinc-700">{p.borrowerImpact}</span>
              </div>
              {p.proposedAmendment && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold uppercase text-emerald-900">
                    Proposed amendment
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-emerald-900">
                    {p.proposedAmendment}
                  </div>
                  {p.amendmentRationale && (
                    <div className="mt-2 text-xs text-emerald-800">
                      <span className="font-medium">Rationale:</span> {p.amendmentRationale}
                    </div>
                  )}
                </div>
              )}
              {p.citations.length > 0 && (
                <div className="text-xs text-zinc-500">
                  {p.citations.map((c, j) => (
                    <span key={j} className="mr-3">
                      {c.act} s {c.section}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function UnenforceabilityPanel({ findings }: { findings: BankUnenforceabilityFinding[] }) {
  const sorted = useMemo(
    () =>
      [...findings].sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          (b.estimatedExposureAud ?? 0) - (a.estimatedExposureAud ?? 0),
      ),
    [findings],
  );
  const totalExposure = findings.reduce(
    (acc, f) => acc + (typeof f.estimatedExposureAud === "number" ? f.estimatedExposureAud : 0),
    0,
  );
  return (
    <section className="rounded-xl border border-red-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-red-700">
        Void or unenforceable terms ({findings.length}) — highest-value findings
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
              <th className="py-2 pr-3">Doctrine</th>
              <th className="py-2 pr-3">Effect</th>
              <th className="py-2 pr-3">Affected clauses</th>
              <th className="py-2 pr-3 text-right">Exposure</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Severity</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 text-zinc-900">
                  <div className="font-medium">{f.doctrine.replace(/_/g, " ")}</div>
                  <div className="text-xs text-zinc-500">
                    {f.trigger.act} s {f.trigger.section}
                  </div>
                </td>
                <td className="py-2 pr-3 text-zinc-700">{f.effect.replace(/_/g, " ")}</td>
                <td className="py-2 pr-3 text-zinc-700">
                  {f.affectedClauses.length > 0 ? f.affectedClauses.join(", ") : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-zinc-900">
                  {fmtAud(f.estimatedExposureAud)}
                </td>
                <td className="py-2 pr-3 text-zinc-600 tabular-nums">
                  {Math.round(f.confidence * 100)}%
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${severityBadge(f.severity)}`}
                  >
                    {f.severity}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="bg-red-50 font-semibold">
              <td colSpan={3} className="py-2 pr-3 text-right text-red-900">
                Total quantified exposure
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-red-900">
                {fmtAud(totalExposure)}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-3">
        {sorted.map((f, i) => (
          <details key={i} className="rounded-lg border border-red-200 px-4 py-3 [&_summary]:cursor-pointer">
            <summary className="text-sm font-medium text-zinc-900">
              {f.lenderConductOrTerm}{" "}
              {f.needsLawyerConfirm && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
                  needs lawyer confirm
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="font-medium">Detection signals:</span>{" "}
                {f.detectionSignals.join(" · ")}
              </div>
              {f.evidence.length > 0 && (
                <div className="rounded-md bg-zinc-50 p-2 text-xs italic">
                  {f.evidence.map((e, j) => (
                    <div key={j}>&ldquo;{e}&rdquo;</div>
                  ))}
                </div>
              )}
              <div>
                <span className="font-medium">Remedy:</span> {f.remedyForBorrower}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function CompliancePanel({ findings }: { findings: BankDocComplianceFinding[] }) {
  const grouped: Record<string, BankDocComplianceFinding[]> = {
    fail: [],
    warning: [],
    needs_review: [],
    pass: [],
  };
  for (const f of findings) (grouped[f.status] ??= []).push(f);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Compliance findings (NCC / ACL / Banking Code / PPSA)
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-center text-sm">
        <Stat n={grouped.fail.length} label="fail" tone="text-red-700" />
        <Stat n={grouped.warning.length} label="warning" tone="text-amber-700" />
        <Stat n={grouped.needs_review.length} label="needs review" tone="text-blue-700" />
        <Stat n={grouped.pass.length} label="pass" tone="text-emerald-700" />
      </div>
      <ul className="mt-4 space-y-2">
        {(["fail", "warning", "needs_review", "pass"] as const).flatMap((status) =>
          grouped[status].map((f, i) => (
            <li
              key={status + i}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${severityBadge(f.severity)}`}
                >
                  {status}
                </span>
                <span className="font-medium text-zinc-900">{f.title}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {f.citations[0]?.act} s {f.citations[0]?.section}
                </span>
              </div>
              <div className="mt-1 text-zinc-700">{f.explanation}</div>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{n}</div>
      <div className="text-xs text-zinc-500 uppercase">{label}</div>
    </div>
  );
}

function RepaymentScenariosPanel({ scenarios }: { scenarios: RepaymentScenario[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Repayment stress-tests
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
              <th className="py-2 pr-3">Scenario</th>
              <th className="py-2 pr-3 text-right">Monthly</th>
              <th className="py-2 pr-3 text-right">Total interest</th>
              <th className="py-2 pr-3 text-right">Effective rate</th>
              <th className="py-2 pr-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 font-medium text-zinc-900">{s.label}</td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {s.monthlyRepayment.raw ?? fmtAud(s.monthlyRepayment.amount)}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {s.totalInterestOverTerm
                    ? (s.totalInterestOverTerm.raw ?? fmtAud(s.totalInterestOverTerm.amount))
                    : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {s.effectiveRatePct?.toFixed(2)}%
                </td>
                <td className="py-2 pr-3 text-xs text-zinc-600">{s.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeeLadderPanel({ rows }: { rows: FeeLadderRow[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Fee ladder
      </h2>
      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-4 text-sm">
            <div className="flex items-baseline justify-between">
              <div className="font-medium text-zinc-900">{r.scenario}</div>
              <div className="font-mono tabular-nums text-zinc-700">
                {fmtAud(r.totalAud)}
              </div>
            </div>
            <ul className="mt-2 divide-y divide-zinc-100">
              {r.fees.map((f, j) => (
                <li key={j} className="flex justify-between py-1.5 text-xs">
                  <span className="text-zinc-700">{f.description}</span>
                  <span className="font-mono tabular-nums text-zinc-900">
                    {f.amount.raw}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function CovenantsPanel({ covenants }: { covenants: CovenantSummary[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Financial covenants ({covenants.length})
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
              <th className="py-2 pr-3">Covenant</th>
              <th className="py-2 pr-3">Threshold</th>
              <th className="py-2 pr-3">Frequency</th>
              <th className="py-2 pr-3">Consequence</th>
              <th className="py-2 pr-3">Severity</th>
            </tr>
          </thead>
          <tbody>
            {covenants.map((c, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 text-zinc-900">{c.description}</td>
                <td className="py-2 pr-3 font-mono text-xs text-zinc-700">{c.threshold}</td>
                <td className="py-2 pr-3 text-zinc-700">{c.testFrequency ?? "—"}</td>
                <td className="py-2 pr-3 text-xs text-zinc-700">{c.consequenceOfBreach}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${severityBadge(c.severity)}`}
                  >
                    {c.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CrossDefaultPanel({ map }: { map: CrossDefaultMap }) {
  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-6 text-orange-900">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-orange-700">
        Cross-default map
      </h2>
      {map.description && <div className="mt-2 text-sm">{map.description}</div>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
        <div>
          <div className="text-xs font-semibold uppercase opacity-70">Affected facilities</div>
          <ul className="ml-4 list-disc">
            {map.affectedFacilities.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase opacity-70">Group impact</div>
          <div>{map.groupCompanyImpact ? "Yes — extends to group / related entities" : "No"}</div>
        </div>
      </div>
      {map.borrowerSurprises.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-xs font-semibold uppercase opacity-70">Borrower surprises</div>
          <ul className="ml-4 list-disc">
            {map.borrowerSurprises.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RegulatoryHooksPanel({ hooks }: { hooks: RegulatoryHook[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Regulatory hooks
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
              <th className="py-2 pr-3">Regime</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3">Available?</th>
              <th className="py-2 pr-3">How to invoke</th>
            </tr>
          </thead>
          <tbody>
            {hooks.map((h, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 text-zinc-900 font-medium">{h.regime.replace(/_/g, " ")}</td>
                <td className="py-2 pr-3 text-zinc-700 text-xs">{h.description}</td>
                <td className="py-2 pr-3">
                  {h.borrowerAvailable ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-200">
                      yes
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      no
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-zinc-700 text-xs">{h.howToInvoke ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LetterPanel({
  letter,
  stream,
  complete,
}: {
  letter: BankDocsReview["letter"];
  stream: string;
  complete: boolean;
}) {
  const sections = letter?.sections;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Letter of advice {!complete && <span className="text-emerald-600">· streaming</span>}
      </h2>
      {sections ? (
        <div className="mt-4 space-y-6">
          {sections.map((s, i) => (
            <div key={i}>
              <h3 className="text-base font-semibold text-zinc-900">{s.heading}</h3>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">
                {s.markdown}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">
          {stream || "(awaiting first chunk…)"}
        </pre>
      )}
    </section>
  );
}
