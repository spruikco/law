"use client";

import Link from "next/link";
import type {
  BillingFinding,
  BillingReview,
  BillingReviewStatus,
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
    status: "computing_totals",
    label: "Compute fees, GST and amount due",
    sub: "Deterministic — fees + uplift + disbursements + GST − trust − prior paid",
    model: "Pure JS",
    typical: "~1s",
  },
  {
    status: "checking_compliance",
    label: "Check LPUL Pt 4.3 + tax invoice form",
    sub: "14 compliance rules across s 172 / s 182 / s 186 / s 187 / s 192 / s 193 / s 195 + GST Act s 29-70",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "drafting_bill",
    label: "Draft tax invoice + cover letter",
    sub: "Streamed Markdown bill ready for solicitor sign-off (s 186)",
    model: "Claude Opus 4.6",
    typical: "~90s",
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

const fmt = (n: number) =>
  n.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function BillingViewer({ initial }: { initial: BillingReview }) {
  const stream = useReviewStream<BillingReview>(
    initial,
    `/api/billing/${initial.id}/events`,
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
    review.status === "complete" ||
    review.status === "issued" ||
    review.status === "paid";

  const findings = review.findings ?? [];

  const deliverable: DeliverableConfig = {
    label: "Bill + tax invoice",
    sections: review.document?.sections,
    streamMarkdown: letterStream,
    streaming: !review.document && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Bill pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "compliance",
      label: "LPUL Pt 4.3 compliance",
      items: findings.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as BillingFinding} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/billing"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Billing module
      </Link>
      <ReviewShell
        eyebrow={`Billing · bill ${review.input.billNumber} · ${review.id.slice(0, 8)}`}
        title={review.input.client.name}
        subtitle={
          <>
            Matter ref:{" "}
            <span className="font-mono text-zinc-700">
              {review.input.matterRef}
            </span>
          </>
        }
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
        overview={review.totals ? <Overview review={review} /> : undefined}
      />
    </div>
  );
}

function Overview({ review }: { review: BillingReview }) {
  const t = review.totals;
  if (!t) return null;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Tag>{review.input.billKind.replace(/_/g, " ")}</Tag>
        <Tag>issued {review.input.issuedOn}</Tag>
        <Tag>due {review.input.dueOn}</Tag>
        {review.input.isConditional && (
          <Tag tone="amber">
            conditional · uplift {review.input.upliftPercent ?? 0}%
          </Tag>
        )}
        {review.input.willWithdrawFromTrust && (
          <Tag tone="sky">trust withdrawal</Tag>
        )}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">
          Computed totals
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm sm:grid-cols-4">
          <Stat label="Fees" value={t.feesSubtotal.amount} />
          {t.upliftAmount && (
            <Stat label="Uplift" value={t.upliftAmount.amount} />
          )}
          <Stat label="Disb (GST)" value={t.disbursementsGstable.amount} />
          <Stat label="Disb (no GST)" value={t.disbursementsNonGstable.amount} />
          <Stat label="Subtotal ex GST" value={t.subtotalExGst.amount} />
          <Stat label="GST" value={t.gst.amount} />
          <Stat label="Total inc GST" value={t.totalIncGst.amount} bold />
          {t.trustOffset && (
            <Stat label="Trust offset" value={-t.trustOffset.amount} />
          )}
          {t.priorPaid && (
            <Stat label="Prior paid" value={-t.priorPaid.amount} />
          )}
          <Stat label="Amount due" value={t.amountDue.amount} bold />
        </div>
      </div>
    </section>
  );
}

function Tag({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "amber" | "sky";
}) {
  const styles = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    sky: "bg-sky-50 text-sky-900 ring-sky-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className={bold ? "rounded-md bg-zinc-900 px-3 py-2 text-white" : ""}>
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

function Particulars({ review }: { review: BillingReview }) {
  const i = review.input;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <Row label="Client" value={i.client.name} />
      <Row label="Bill number" value={i.billNumber} />
      <Row label="Bill kind" value={i.billKind.replace(/_/g, " ")} />
      <Row label="Matter ref" value={i.matterRef} />
      <Row label="Issued" value={i.issuedOn} />
      <Row label="Due" value={i.dueOn} />
      <Row
        label="Conditional"
        value={
          i.isConditional ? `Yes — uplift ${i.upliftPercent ?? 0}%` : "No"
        }
      />
      <Row
        label="Trust withdrawal"
        value={i.willWithdrawFromTrust ? "Yes" : "No"}
      />
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
