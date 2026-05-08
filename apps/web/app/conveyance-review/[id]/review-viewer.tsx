"use client";

import Link from "next/link";
import type {
  ConveyanceFinding,
  ConveyanceReview,
  ConveyanceReviewStatus,
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
    status: "computing_adjustments",
    label: "Compute adjustments + stamp duty",
    sub: "Pro-rata council/water/OC/land tax + Duties Act 2000 (Vic) bands and concessions",
    model: "Pure JS",
    typical: "~1s",
  },
  {
    status: "checking_compliance",
    label: "Check VIC settlement compliance",
    sub: "13 rules across SLA s 32 / s 27 / s 10G, Land Tax Act s 96, Duties Act, OC Act s 23",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "drafting_statement",
    label: "Draft settlement statement",
    sub: "Header · matter summary · price · adjustments · duty · totals · payment directions · post-settlement checklist · sign-off",
    model: "Claude Opus 4.6",
    typical: "~90s",
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

const fmt = (n: number) =>
  n.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ConveyanceViewer({ initial }: { initial: ConveyanceReview }) {
  const stream = useReviewStream<ConveyanceReview>(
    initial,
    `/api/conveyance/${initial.id}/events`,
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
  } = stream;

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const isTerminal =
    review.status === "complete" || review.status === "settled";

  const findings = review.findings ?? [];

  const deliverable: DeliverableConfig = {
    label: "Settlement statement",
    sections: review.document?.sections,
    streamMarkdown: letterStream,
    streaming: !review.document && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Statement pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "compliance",
      label: "VIC settlement compliance",
      items: findings.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as ConveyanceFinding} />,
      })),
    },
  ];

  const i = review.input;

  return (
    <div>
      <Link
        href="/conveyance"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Conveyance module
      </Link>
      <ReviewShell
        eyebrow={`Settlement statement · ${review.id.slice(0, 8)} · acting for ${i.side}`}
        title={`${i.property.addressLine}, ${i.property.suburb} ${i.property.postcode}`}
        status={isTerminal ? "complete" : review.status}
        errorText={review.error}
        stages={STAGES}
        stageIdx={stageIdx}
        stageStart={stageStart}
        now={now}
        progressByPass={progressByPass}
        eventCount={eventCount}
        lastEventAt={lastEventAt}
        totalElapsedSec={totalElapsedSec}
        deliverable={deliverable}
        findingsGroups={findingsGroups}
        particulars={<Particulars review={review} />}
        overview={review.calculation ? <Overview review={review} /> : undefined}
      />
    </div>
  );
}

function Overview({ review }: { review: ConveyanceReview }) {
  const calc = review.calculation;
  if (!calc) return null;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
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
            strong
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
            <span className="font-mono">
              ${fmt(calc.stampDuty.dutiableValue.amount)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Adjustment lines: </span>
            <span className="font-mono">{calc.adjustments.length}</span>
          </div>
        </div>
      </section>

      {calc.adjustments.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Settlement adjustments
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              From the purchaser's perspective. Days shown as Vendor /
              Purchaser / Total.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">V/P/Total days</th>
                  <th className="px-4 py-2">Side</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Citations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {calc.adjustments.map((a, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{a.description}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {a.daysVendor != null &&
                      a.daysPurchaser != null &&
                      a.totalDays != null
                        ? `${a.daysVendor}/${a.daysPurchaser}/${a.totalDays}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right font-mono">
                      ${fmt(a.amount.amount)}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {a.citations
                        .map(
                          (c) =>
                            `${c.act.replace(/\(Vic\)/, "").trim()} s ${c.section}`,
                        )
                        .join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Stamp duty working — Duties Act 2000 (Vic)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DutyRow
            label="Dutiable value"
            amount={calc.stampDuty.dutiableValue.amount}
          />
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
    </div>
  );
}

function Stat({
  label,
  text,
  strong,
}: {
  label: string;
  text: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold ${strong ? "text-zinc-900" : "text-zinc-800"}`}
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
      className={`flex items-baseline justify-between rounded-md px-3 py-2 ${
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

function Particulars({ review }: { review: ConveyanceReview }) {
  const i = review.input;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <Row
        label="Address"
        value={`${i.property.addressLine}, ${i.property.suburb} ${i.property.postcode}`}
      />
      <Row label="Acting for" value={i.side} />
      <Row label="Vendor" value={i.vendor.name} />
      <Row label="Purchaser" value={i.purchaser.name} />
      <Row label="Settlement" value={i.settlementDate} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <>
      <dt className="text-zinc-500 capitalize">{label}</dt>
      <dd className="text-zinc-900">{value ?? "—"}</dd>
    </>
  );
}
