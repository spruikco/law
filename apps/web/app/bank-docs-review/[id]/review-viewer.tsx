"use client";

import Link from "next/link";
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
import {
  ReviewShell,
  type DeliverableConfig,
} from "../../../components/review/review-shell";
import type { FindingsGroup } from "../../../components/review/findings-accordion";
import {
  StatusBadge,
  type Severity,
} from "../../../components/review/severity-badge";
import { useReviewStream } from "../../../components/review/use-review-stream";
import type { PipelineStage } from "../../../components/review/pipeline-progress";
import {
  ComplianceBody,
  asFindingStatus,
} from "../../../components/review/finding-bodies";

const STAGES: PipelineStage[] = [
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

function fmtAud(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

export function BankDocsReviewViewer({ initial }: { initial: BankDocsReview }) {
  const stream = useReviewStream<BankDocsReview>(
    initial,
    `/api/bank-docs-review/${initial.id}/events`,
  );
  const {
    review,
    letterStream,
    stageStart,
    progressByPass,
    eventCount,
    lastEventAt,
    now,
    totalElapsedSec,
    connection,
  } = stream;

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const extraction = review.extraction;
  const provisions = (extraction?.provisions ?? []).filter(
    (p) => p.classification !== "standard",
  );

  const deliverable: DeliverableConfig = {
    label: "Letter of advice",
    sections: review.letter?.sections,
    streamMarkdown: letterStream,
    streaming: !review.letter && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Letter pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "unenforceability",
      label: "Unenforceability — high-value findings",
      items: review.unenforceability.map((f, i) => ({
        id: `unenf-${i}`,
        title: f.lenderConductOrTerm,
        severity: f.severity as Severity,
        subtitle: `${f.doctrine.replace(/_/g, " ")} · ${f.effect.replace(/_/g, " ")}${
          typeof f.estimatedExposureAud === "number"
            ? ` · ${fmtAud(f.estimatedExposureAud)} exposure`
            : ""
        }`,
        body: <UnenforceabilityBody finding={f} />,
      })),
    },
    {
      id: "compliance",
      label: "Compliance (NCC / ACL / Banking Code / PPSA)",
      items: review.compliance.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as BankDocComplianceFinding} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/bank-docs"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Bank documents module
      </Link>
      <ReviewShell
        eyebrow={`Bank docs review · ${review.id.slice(0, 8)}`}
        title={
          extraction?.particulars.borrowerName ??
          extraction?.particulars.parties[0]?.name ??
          "(borrower pending)"
        }
        subtitle={
          extraction ? <ClassificationTags extraction={extraction} /> : undefined
        }
        status={review.status}
        errorText={review.error}
        stages={STAGES}
        stageIdx={stageIdx}
        stageStart={stageStart}
        now={now}
        progressByPass={progressByPass}
        eventCount={eventCount}
        lastEventAt={lastEventAt}
        totalElapsedSec={totalElapsedSec}
      connection={connection}
        deliverable={deliverable}
        findingsGroups={findingsGroups}
        particulars={
          extraction ? (
            <ExtractionPanel extraction={extraction} />
          ) : (
            <div className="text-sm italic text-zinc-400">
              Extraction pending.
            </div>
          )
        }
        overview={<Headline review={review} />}
        extraTabs={[
          ...(provisions.length > 0
            ? [
                {
                  def: {
                    id: "schedule",
                    label: "Schedule",
                    count: provisions.length,
                  },
                  render: () => <ProvisionsTab provisions={provisions} />,
                },
              ]
            : []),
          ...(review.repaymentScenarios.length > 0 ||
          review.feeLadder.length > 0 ||
          review.covenants.length > 0 ||
          review.crossDefault?.hasCrossDefault ||
          review.regulatoryHooks.length > 0
            ? [
                {
                  def: { id: "numbers", label: "Numbers" },
                  render: () => <NumbersTab review={review} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function ClassificationTags({
  extraction,
}: {
  extraction: BankDocsExtractionBundle;
}) {
  const c = extraction.classification;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Tag>{c.kind.replace(/_/g, " ")}</Tag>
      {c.isConsumerCredit && <Tag tone="emerald">NCC applies</Tag>}
      {c.isUnfairContractTermsRegime && <Tag tone="blue">ACL UCT regime</Tag>}
      {c.isThirdPartyGuarantee && (
        <Tag tone="orange">Third-party guarantee — Garcia risk</Tag>
      )}
    </div>
  );
}

function Headline({ review }: { review: BankDocsReview }) {
  const totalExposure = review.unenforceability
    .filter((u) => typeof u.estimatedExposureAud === "number")
    .reduce((acc, u) => acc + (u.estimatedExposureAud ?? 0), 0);
  const criticalUnenf = review.unenforceability.filter(
    (u) => u.severity === "critical" || u.severity === "high",
  ).length;
  const failCompliance = review.compliance.filter(
    (c) => c.status === "fail",
  ).length;
  const uctCandidates =
    review.extraction?.provisions.filter((p) => p.uctCandidate).length ?? 0;

  let verdict = "Standard pack — minor amendments only";
  let tone = "border-emerald-200 bg-emerald-50";
  if (criticalUnenf > 0 || failCompliance > 2) {
    verdict =
      "Material lender non-compliance / unenforceable terms — prioritise renegotiation";
    tone = "border-red-200 bg-red-50";
  } else if (failCompliance > 0 || uctCandidates > 2) {
    verdict = "Compliance / UCT issues to address before signing";
    tone = "border-amber-200 bg-amber-50";
  }

  return (
    <section className={`rounded-xl border p-6 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
        Headline risk
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{verdict}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
        <BigStat
          n={review.unenforceability.length}
          label="Unenforceability findings"
        />
        <BigStat n={fmtAud(totalExposure)} label="Quantified exposure" />
        <BigStat n={failCompliance} label="Compliance fails" />
        <BigStat n={uctCandidates} label="ACL UCT candidates" />
      </div>
    </section>
  );
}

function BigStat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums text-zinc-900">
        {n}
      </div>
      <div className="mt-0.5 text-xs text-zinc-600">{label}</div>
    </div>
  );
}

function UnenforceabilityBody({ finding: f }: { finding: BankUnenforceabilityFinding }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <KV label="Doctrine" value={f.doctrine.replace(/_/g, " ")} />
        <KV label="Effect" value={f.effect.replace(/_/g, " ")} />
        <KV
          label="Trigger"
          value={`${f.trigger.act} s ${f.trigger.section}`}
        />
        <KV label="Confidence" value={`${Math.round(f.confidence * 100)}%`} />
        {f.affectedClauses.length > 0 && (
          <KV
            label="Affected clauses"
            value={f.affectedClauses.join(", ")}
            wide
          />
        )}
        {typeof f.estimatedExposureAud === "number" && (
          <KV
            label="Estimated exposure"
            value={fmtAud(f.estimatedExposureAud)}
          />
        )}
      </div>
      {f.detectionSignals.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Detection signals
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-zinc-700">
            {f.detectionSignals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {f.evidence.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Evidence
          </div>
          <ul className="list-disc space-y-0.5 pl-5 italic text-zinc-700">
            {f.evidence.map((e, i) => (
              <li key={i}>“{e}”</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-md bg-zinc-50 p-3 text-zinc-800 ring-1 ring-inset ring-zinc-200">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Remedy for borrower
        </div>
        <div>{f.remedyForBorrower}</div>
      </div>
      {f.needsLawyerConfirm && (
        <div className="text-xs italic text-amber-700">
          Needs lawyer confirmation.
        </div>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-900">{value}</div>
    </div>
  );
}

function ExtractionPanel({
  extraction,
}: {
  extraction: BankDocsExtractionBundle;
}) {
  const p = extraction.particulars;
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Facility particulars
          </h3>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
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
              <Row
                label="Default rate"
                value={
                  p.interestRate.defaultRatePct
                    ? `${p.interestRate.defaultRatePct}%`
                    : "—"
                }
              />
            </>
          )}
          {p.repayment && (
            <>
              <Row label="Repayment" value={p.repayment.frequency} />
              <Row
                label="Term (months)"
                value={p.repayment.termMonths?.toString()}
              />
            </>
          )}
        </dl>
      </section>

      {p.securities.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Securities ({p.securities.length})
            </h3>
          </header>
          <ul className="divide-y divide-zinc-100">
            {p.securities.map((s, i) => (
              <li key={i} className="px-4 py-3 text-sm">
                <div className="font-medium text-zinc-900">
                  {s.kind.replace(/_/g, " ")} —{" "}
                  <span className="font-normal text-zinc-700">
                    {s.description}
                  </span>
                </div>
                {s.detail && (
                  <div className="mt-1 text-xs text-zinc-500">{s.detail}</div>
                )}
                <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                  {s.capAmount && <span>cap {s.capAmount.raw}</span>}
                  {s.crossCollateralised && (
                    <span className="text-orange-700">cross-collateralised</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {extraction.guarantee.present && (
        <section className="overflow-hidden rounded-xl border border-orange-200 bg-orange-50">
          <header className="border-b border-orange-200 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-800">
              Guarantee assessment
            </h3>
          </header>
          <div className="space-y-3 px-4 py-3 text-sm text-orange-900">
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <div>
                Guarantors: {extraction.guarantee.guarantors.join(", ") || "—"}
              </div>
              <div>
                Capped: {extraction.guarantee.capped ? "yes" : "NO (uncapped)"}
                {extraction.guarantee.capAmount
                  ? ` (${extraction.guarantee.capAmount.raw})`
                  : ""}
              </div>
              <div>
                Principal-debtor clause:{" "}
                {extraction.guarantee.principalDebtorClause
                  ? "PRESENT — Yerkey/Garcia equity defeated"
                  : "absent"}
              </div>
              <div>
                ILA required:{" "}
                {extraction.guarantee.independentLegalAdviceRequired
                  ? "yes"
                  : "no"}{" "}
                {extraction.guarantee.ilaCertificateAttached
                  ? "(certificate attached)"
                  : ""}
              </div>
            </div>
            {extraction.guarantee.garciaRiskFlags.length > 0 && (
              <div>
                <div className="font-medium">Garcia risk flags:</div>
                <ul className="ml-4 list-disc">
                  {extraction.guarantee.garciaRiskFlags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {extraction.guarantee.codeOfBankingPracticeIssues.length > 0 && (
              <div>
                <div className="font-medium">Banking Code 2025 issues:</div>
                <ul className="ml-4 list-disc">
                  {extraction.guarantee.codeOfBankingPracticeIssues.map(
                    (f, i) => (
                      <li key={i}>{f}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-900">{value || "—"}</dd>
    </div>
  );
}

function ProvisionsTab({ provisions }: { provisions: BankDocProvision[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Borrower-adverse / unusual clauses with proposed amendments. Showing{" "}
        {provisions.length} of total — standard clauses excluded.
      </p>
      {provisions.map((p, i) => (
        <details
          key={i}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white [&>summary]:cursor-pointer"
        >
          <summary className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-zinc-50">
            <span className="font-mono text-xs text-zinc-500">{p.number}</span>
            <Tag tone={severityTone(p.severity)}>{p.severity}</Tag>
            <Tag>{p.classification.replace(/_/g, " ")}</Tag>
            <span className="text-xs text-zinc-500">
              {p.focusArea.replace(/_/g, " ")}
            </span>
            {p.uctCandidate && <Tag tone="blue">UCT candidate</Tag>}
            <span className="ml-auto truncate text-zinc-900">{p.summary}</span>
          </summary>
          <div className="space-y-3 border-t border-zinc-100 px-4 py-3 text-sm">
            <div className="rounded-md bg-zinc-50 p-3 font-mono text-xs whitespace-pre-wrap text-zinc-800">
              {p.fullText}
            </div>
            <div>
              <span className="font-medium text-zinc-700">Borrower impact:</span>{" "}
              <span className="text-zinc-700">{p.borrowerImpact}</span>
            </div>
            {p.proposedAmendment && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-emerald-900">
                  Proposed amendment
                </div>
                <div className="mt-1 whitespace-pre-wrap text-emerald-900">
                  {p.proposedAmendment}
                </div>
                {p.amendmentRationale && (
                  <div className="mt-2 text-xs text-emerald-800">
                    <span className="font-medium">Rationale:</span>{" "}
                    {p.amendmentRationale}
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
  );
}

function NumbersTab({ review }: { review: BankDocsReview }) {
  return (
    <div className="space-y-6">
      {review.repaymentScenarios.length > 0 && (
        <Section title="Repayment stress-tests">
          <Table
            headers={[
              "Scenario",
              "Monthly",
              "Total interest",
              "Effective rate",
              "Notes",
            ]}
            rows={review.repaymentScenarios.map((s: RepaymentScenario) => [
              s.label,
              s.monthlyRepayment.raw ?? fmtAud(s.monthlyRepayment.amount),
              s.totalInterestOverTerm
                ? (s.totalInterestOverTerm.raw ??
                  fmtAud(s.totalInterestOverTerm.amount))
                : "—",
              s.effectiveRatePct ? `${s.effectiveRatePct.toFixed(2)}%` : "—",
              s.notes ?? "—",
            ])}
            rightAlign={[1, 2, 3]}
          />
        </Section>
      )}

      {review.feeLadder.length > 0 && (
        <Section title="Fee ladder">
          <div className="space-y-3">
            {review.feeLadder.map((r: FeeLadderRow, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-sm"
              >
                <div className="flex items-baseline justify-between">
                  <div className="font-medium text-zinc-900">{r.scenario}</div>
                  <div className="font-mono tabular-nums text-zinc-700">
                    {fmtAud(r.totalAud)}
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-zinc-100">
                  {r.fees.map((f, j) => (
                    <li
                      key={j}
                      className="flex justify-between py-1.5 text-xs"
                    >
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
        </Section>
      )}

      {review.covenants.length > 0 && (
        <Section title={`Financial covenants (${review.covenants.length})`}>
          <Table
            headers={[
              "Covenant",
              "Threshold",
              "Frequency",
              "Consequence",
              "Severity",
            ]}
            rows={review.covenants.map((c: CovenantSummary) => [
              c.description,
              c.threshold,
              c.testFrequency ?? "—",
              c.consequenceOfBreach,
              c.severity,
            ])}
          />
        </Section>
      )}

      {review.crossDefault?.hasCrossDefault && (
        <CrossDefaultBlock map={review.crossDefault} />
      )}

      {review.regulatoryHooks.length > 0 && (
        <Section title="Regulatory hooks">
          <Table
            headers={["Regime", "Description", "Available?", "How to invoke"]}
            rows={review.regulatoryHooks.map((h: RegulatoryHook) => [
              h.regime.replace(/_/g, " "),
              h.description,
              h.borrowerAvailable ? "yes" : "no",
              h.howToInvoke ?? "—",
            ])}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Table({
  headers,
  rows,
  rightAlign = [],
}: {
  headers: string[];
  rows: (string | number)[][];
  rightAlign?: number[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-widest text-zinc-500">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-4 py-2 ${rightAlign.includes(i) ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-800">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2 align-top ${rightAlign.includes(j) ? "text-right font-mono tabular-nums" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrossDefaultBlock({ map }: { map: CrossDefaultMap }) {
  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-6 text-orange-900">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-800">
        Cross-default map
      </h3>
      {map.description && <p className="mt-2 text-sm">{map.description}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            Affected facilities
          </div>
          <ul className="ml-4 list-disc">
            {map.affectedFacilities.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            Group impact
          </div>
          <div>
            {map.groupCompanyImpact
              ? "Yes — extends to group / related entities"
              : "No"}
          </div>
        </div>
      </div>
      {map.borrowerSurprises.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            Borrower surprises
          </div>
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

function Tag({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "amber" | "red" | "emerald" | "orange" | "blue";
}) {
  const styles = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-900 ring-red-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    orange: "bg-orange-50 text-orange-900 ring-orange-200",
    blue: "bg-blue-50 text-blue-800 ring-blue-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}

function severityTone(
  s: string,
): "red" | "amber" | "zinc" | "orange" {
  if (s === "critical") return "red";
  if (s === "high") return "orange";
  if (s === "medium") return "amber";
  return "zinc";
}
