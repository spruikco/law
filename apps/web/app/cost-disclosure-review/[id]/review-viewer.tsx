"use client";

import Link from "next/link";
import type {
  CostDisclosureFinding,
  CostDisclosureReview,
  CostDisclosureReviewStatus,
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
    status: "checking_compliance",
    label: "Check LPUL s 174 mandatory elements",
    sub: "11 mandatory disclosure rules",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "drafting_letter",
    label: "Draft cost disclosure letter",
    sub: "Streamed Markdown letter ready for solicitor sign-off",
    model: "Claude Opus 4.6",
    typical: "~90s",
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

export function CostDisclosureViewer({
  initial,
}: {
  initial: CostDisclosureReview;
}) {
  const stream = useReviewStream<CostDisclosureReview>(
    initial,
    `/api/cost-disclosure/${initial.id}/events`,
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
  const isTerminal =
    review.status === "complete" ||
    review.status === "issued" ||
    review.status === "accepted";

  const findings = review.findings ?? [];

  const deliverable: DeliverableConfig = {
    label: "Cost disclosure letter",
    sections: review.letter?.sections,
    streamMarkdown: letterStream,
    streaming: !review.letter && !!letterStream,
    streamingHint: "drafting from Claude Opus 4.6…",
    emptyHint: "Letter pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "compliance",
      label: "LPUL s 174 mandatory elements",
      items: findings.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f as CostDisclosureFinding} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/cost-disclosure"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Cost disclosure module
      </Link>
      <ReviewShell
        eyebrow={`Cost disclosure · ${review.id.slice(0, 8)}`}
        title={review.input.client.name}
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
      connection={connection}
        deliverable={deliverable}
        findingsGroups={findingsGroups}
        particulars={<Particulars review={review} />}
      />
    </div>
  );
}

function Particulars({ review }: { review: CostDisclosureReview }) {
  const i = review.input;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <Row label="Client" value={i.client.name} />
      <Row label="Matter type" value={i.matterType.replace(/_/g, " ")} />
      <Row label="Fee basis" value={i.feeBasis} />
      <Row
        label="Conditional"
        value={
          i.isConditional
            ? `Yes — uplift ${i.upliftPercent ?? 0}%`
            : "No"
        }
      />
      <Row
        label="Sophisticated client"
        value={i.isSophisticatedClient ? "Yes (s 174(4))" : "No"}
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
