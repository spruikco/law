"use client";

import type {
  ComplianceFinding,
  Review,
  ReviewStatus,
  RiskFinding,
} from "@law/schema";
import {
  ReviewShell,
  type DeliverableConfig,
} from "../../../components/review/review-shell";
import type { FindingsGroup } from "../../../components/review/findings-accordion";
import {
  StatusBadge,
  type Severity,
  type FindingStatus,
} from "../../../components/review/severity-badge";
import {
  useReviewStream,
} from "../../../components/review/use-review-stream";
import type { PipelineStage } from "../../../components/review/pipeline-progress";

const STAGES: PipelineStage[] = [
  {
    status: "classifying",
    label: "Classify documents",
    sub: "Identify CoS / s32 / supporting PDFs",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract structured data",
    sub: "Particulars, special conditions, OC, title, tax certs",
    model: "Claude Sonnet 4.6",
    typical: "~25s",
  },
  {
    status: "checking_compliance",
    label: "Check compliance",
    sub: "Run every mandatory rule against extracted data + RAG",
    model: "Claude Sonnet 4.6",
    typical: "~60s",
  },
  {
    status: "analysing_risk",
    label: "Analyse risk",
    sub: "Conditions precedent · risky SCs · GC variations · tax triggers",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a lawyer-reviewable letter",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<ReviewStatus, number> = {
  pending: 0,
  classifying: 1,
  extracting: 2,
  checking_compliance: 3,
  analysing_risk: 4,
  composing_letter: 5,
  complete: 6,
  failed: -1,
};

export function ReviewViewer({ initial }: { initial: Review }) {
  const stream = useReviewStream<Review>(
    initial,
    `/api/review/${initial.id}/events`,
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
  const complete = review.status === "complete";

  const deliverable: DeliverableConfig = {
    label: "Letter of advice",
    sections: review.letter?.sections,
    streamMarkdown: letterStream,
    streaming: !review.letter && !!letterStream,
    streamingHint: "streaming from Claude Opus 4.6…",
    emptyHint: "Letter composition pending.",
  };

  const findingsGroups: FindingsGroup[] = [
    {
      id: "compliance",
      label: "Compliance",
      items: review.compliance.map((c) => complianceItem(c)),
    },
    {
      id: "risk",
      label: "Risk",
      items: review.risks.map((r) => riskItem(r)),
    },
  ];

  return (
    <ReviewShell
      eyebrow={`Review · ${review.id.slice(0, 8)}`}
      title={
        review.extraction?.particulars.propertyAddress ??
        "(property address pending)"
      }
      jurisdictionTag={review.jurisdiction}
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
      exportLinks={
        complete
          ? [
              { label: "Download PDF", href: `/api/export/${review.id}/pdf` },
              { label: "Download DOCX", href: `/api/export/${review.id}/docx` },
            ]
          : undefined
      }
      deliverable={deliverable}
      findingsGroups={findingsGroups}
      particulars={<Particulars review={review} />}
    />
  );
}

function complianceItem(c: ComplianceFinding) {
  return {
    id: c.ruleId,
    title: c.title,
    severity: c.severity as Severity,
    trailing: <StatusBadge status={c.status as FindingStatus} />,
    subtitle:
      c.citations.length > 0
        ? c.citations
            .slice(0, 2)
            .map((cit) => `${cit.act} s ${cit.section}`)
            .join(" · ")
        : undefined,
    body: (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-700 leading-relaxed">{c.explanation}</p>
        {c.citations.length > 0 && (
          <div className="border-t border-zinc-100 pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Citations
            </div>
            <ul className="space-y-1.5 text-xs text-zinc-600">
              {c.citations.map((cit, i) => (
                <li key={i}>
                  <em>{cit.act}</em> s {cit.section}
                  {cit.quotedText && (
                    <span className="text-zinc-500"> — “{cit.quotedText}”</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    ),
  };
}

function riskItem(r: RiskFinding) {
  const refParts: string[] = [];
  if (r.specialConditionNumber) refParts.push(`SC ${r.specialConditionNumber}`);
  if (r.generalConditionNumber) refParts.push(`GC ${r.generalConditionNumber}`);
  return {
    id: r.id,
    title: r.title,
    severity: r.severity as Severity,
    subtitle: refParts.length > 0 ? refParts.join(" · ") : undefined,
    body: (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-700 leading-relaxed">{r.explanation}</p>
        {r.netEffect && (
          <p className="text-zinc-900">
            <span className="font-medium">Net effect:</span> {r.netEffect}
          </p>
        )}
      </div>
    ),
  };
}

function Particulars({ review }: { review: Review }) {
  const p = review.extraction?.particulars;
  if (!p)
    return (
      <div className="text-sm italic text-zinc-400">
        Extraction pending.
      </div>
    );
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <Row label="Property" value={p.propertyAddress} />
      <Row label="Price" value={p.price.raw} />
      <Row label="Deposit" value={p.deposit.raw} />
      <Row label="Settlement" value={p.settlementDate} />
      {p.parties.map((party, i) => (
        <Row
          key={i}
          label={party.role.replace(/_/g, " ")}
          value={party.name}
        />
      ))}
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
