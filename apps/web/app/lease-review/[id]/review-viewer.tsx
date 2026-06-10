"use client";

import Link from "next/link";
import type {
  AdditionalProvision,
  CommentaryRiskFinding,
  LandlordNotificationObligation,
  LeaseChainAnalysis,
  LeaseExtractionBundle,
  LeaseReview,
  LeaseReviewStatus,
  MarketReviewProjection,
  OptionExerciseAnalysis,
  PlanningCompliance,
  UnenforceabilityFinding,
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
    label: "Classify retail vs non-retail",
    sub: "Apply s4 RLA 2003 test",
    model: "Claude Sonnet 4.6",
    typical: "~10s",
  },
  {
    status: "extracting",
    label: "Extract lease items + focus areas",
    sub: "Parallel tool use — items, make-good, outgoings, ongoing obligations",
    model: "Claude Sonnet 4.6",
    typical: "~30s",
  },
  {
    status: "checking_compliance",
    label: "RLA compliance + unenforceability",
    sub: "Mandatory protections, then landlord-breach voids",
    model: "Claude Sonnet 4.6",
    typical: "~2m",
  },
  {
    status: "analysing_clauses",
    label: "Analyse clauses + propose amendments",
    sub: "Classify each additional provision; draft polite-but-firm redlines",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
  {
    status: "synthesising_capabilities",
    label: "Synthesise forecasts, options, planning, lease chain",
    sub: "Make-good band, market projections, option analysis, notifications, LIV version",
    model: "Claude Sonnet 4.6 + deterministic",
    typical: "~30s",
  },
  {
    status: "composing_letter",
    label: "Compose letter of advice",
    sub: "Stream a tenant-facing letter",
    model: "Claude Opus 4.6",
    typical: "~2m",
  },
];

const STATUS_ORDER: Record<LeaseReviewStatus, number> = {
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

export function LeaseReviewViewer({ initial }: { initial: LeaseReview }) {
  const stream = useReviewStream<LeaseReview>(
    initial,
    `/api/lease-review/${initial.id}/events`,
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
  const provisions = extraction?.additionalProvisions ?? [];
  const nonStandardProvisions = provisions.filter(
    (p) => p.classification !== "standard",
  );
  const commentaryRisks = review.commentaryRisks ?? [];

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
      label: "Void / unenforceable clauses — landlord non-compliance",
      items: review.unenforceability.map((f) => ({
        id: f.ruleId,
        title: f.landlordFailure,
        severity: f.severity as Severity,
        subtitle: `${f.trigger.act} s ${f.trigger.section} · ${f.effect.replace(/_/g, " ")}${
          typeof f.estimatedExposureAud === "number"
            ? ` · ~$${f.estimatedExposureAud.toLocaleString("en-AU")}`
            : ""
        }`,
        body: <UnenforceabilityBody f={f} />,
      })),
    },
    {
      id: "rla",
      label: "RLA compliance",
      items: review.rlaCompliance.map((f) => ({
        id: f.ruleId,
        title: f.title,
        severity: f.severity as Severity,
        trailing: <StatusBadge status={asFindingStatus(f.status)} />,
        body: <ComplianceBody finding={f} />,
      })),
    },
    {
      id: "commentary",
      label: "Commentary risks",
      items: commentaryRisks.map((c, i) => ({
        id: `commentary-${i}`,
        title: c.biggestRiskTenant ?? "Commentary risk",
        severity: "medium" as Severity,
        body: <CommentaryBody c={c} />,
      })),
    },
  ];

  return (
    <div>
      <Link
        href="/lease"
        className="mb-3 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Lease module
      </Link>
      <ReviewShell
        eyebrow={`Lease review · ${review.id.slice(0, 8)}`}
        title={extraction?.items.premisesAddress ?? "(premises pending)"}
        subtitle={
          extraction?.classification ? (
            <Tag
              tone={
                extraction.classification.rlaApplies ? "emerald" : "zinc"
              }
            >
              {extraction.classification.kind.replace("_", "-")}
              {extraction.classification.rlaApplies
                ? " · RLA applies"
                : " · RLA does not apply"}
            </Tag>
          ) : undefined
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
            <LeaseDetails extraction={extraction} review={review} />
          ) : (
            <div className="text-sm italic text-zinc-400">
              Extraction pending.
            </div>
          )
        }
        overview={extraction ? <Headline review={review} /> : undefined}
        extraTabs={
          nonStandardProvisions.length > 0
            ? [
                {
                  def: {
                    id: "schedule",
                    label: "Schedule",
                    count: nonStandardProvisions.length,
                  },
                  render: () =>
                    extraction ? (
                      <ScheduleTab extraction={extraction} />
                    ) : null,
                },
              ]
            : []
        }
      />
    </div>
  );
}

function Headline({ review }: { review: LeaseReview }) {
  const findings = review.unenforceability ?? [];
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const exposure = findings.reduce(
    (acc, f) =>
      acc +
      (typeof f.estimatedExposureAud === "number"
        ? f.estimatedExposureAud
        : 0),
    0,
  );
  const provisions = review.extraction?.additionalProvisions ?? [];
  const mustFix = provisions
    .filter(
      (p) =>
        (p.classification === "rla_conflict" ||
          p.classification === "tenant_adverse") &&
        (p.severity === "critical" || p.severity === "high"),
    )
    .slice(0, 3);
  const mg = review.extraction?.makeGoodCostBand;

  let label: string;
  let tone: string;
  if (critical > 0 || mustFix.length >= 2) {
    label = "Do not sign without amendments";
    tone = "border-red-200 bg-red-50";
  } else if (high > 0 || mustFix.length === 1) {
    label = "Sign only after key amendments";
    tone = "border-amber-200 bg-amber-50";
  } else {
    label = "Acceptable with standard amendments";
    tone = "border-emerald-200 bg-emerald-50";
  }

  return (
    <section className={`rounded-xl border p-6 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
        At a glance
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{label}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          k="Quantified exposure"
          v={exposure > 0 ? `~$${exposure.toLocaleString("en-AU")}` : "—"}
          sub="From RLA breaches"
        />
        <Metric
          k="Critical findings"
          v={String(critical)}
          sub={`${high} high · ${findings.length - critical - high} other`}
          tone={critical > 0 ? "red" : high > 0 ? "amber" : "neutral"}
        />
        <Metric
          k="Make-good band"
          v={
            mg?.estimateLowAud && mg?.estimateHighAud
              ? `$${(mg.estimateLowAud / 1000).toFixed(0)}–${(mg.estimateHighAud / 1000).toFixed(0)}k`
              : mg?.band
                ? mg.band.replace("_", " ")
                : "—"
          }
          sub={mg?.qsReferralRecommended ? "QS referral" : (mg?.band ?? "")}
          tone={
            mg?.band === "bare_shell" || mg?.band === "heavy"
              ? "red"
              : "neutral"
          }
        />
        <Metric
          k="Non-standard clauses"
          v={String(
            provisions.filter((p) => p.classification !== "standard").length,
          )}
          sub={`of ${provisions.length} total`}
          tone={mustFix.length > 0 ? "amber" : "neutral"}
        />
      </div>
      {mustFix.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Top must-fix amendments
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {mustFix.map((p) => (
              <li key={p.number} className="flex items-start gap-2">
                <span className="font-mono text-xs text-zinc-500">
                  {p.number}
                </span>
                <span className="text-zinc-800">
                  <span className="font-medium">
                    {p.heading || p.focusArea.replace(/_/g, " ")}
                  </span>
                  {" — "}
                  {p.tenantImpact}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "red" | "amber" | "neutral";
}) {
  const valueCls =
    tone === "red"
      ? "text-red-900"
      : tone === "amber"
        ? "text-amber-900"
        : "text-zinc-900";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {k}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>
        {v}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function UnenforceabilityBody({ f }: { f: UnenforceabilityFinding }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-relaxed text-zinc-700">{f.landlordFailure}</p>
      {f.affectedClauses.length > 0 && (
        <div className="text-xs text-zinc-600">
          <span className="font-medium">Affected clauses:</span>{" "}
          {f.affectedClauses.join(" · ")}
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
      <div className="rounded-md bg-sky-50 p-3 text-sky-900 ring-1 ring-inset ring-sky-200">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-sky-700">
          Remedy for tenant
        </div>
        <div className="whitespace-pre-line">{f.remedyForTenant}</div>
      </div>
      <div className="text-xs text-zinc-500">
        Confidence: {Math.round(f.confidence * 100)}%
        {f.needsLawyerConfirm && " · needs lawyer confirm"}
      </div>
    </div>
  );
}

function CommentaryBody({ c }: { c: CommentaryRiskFinding }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Source
        </div>
        <div className="mt-0.5 text-zinc-800">
          {c.articleUrl ? (
            <a
              href={c.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
            >
              {c.articleTitle}
            </a>
          ) : (
            c.articleTitle
          )}{" "}
          <span className="text-xs text-zinc-500">
            ({c.source.replace(/_/g, " ")})
          </span>
        </div>
      </div>
      <p className="leading-relaxed text-zinc-700">{c.riskSummary}</p>
      {c.biggestRiskTenant && (
        <p>
          <span className="font-semibold text-zinc-900">Tenant risk: </span>
          <span className="text-zinc-700">{c.biggestRiskTenant}</span>
        </p>
      )}
      {c.biggestRiskLandlord && (
        <p>
          <span className="font-semibold text-zinc-900">Landlord risk: </span>
          <span className="text-zinc-700">{c.biggestRiskLandlord}</span>
        </p>
      )}
      {c.matchReason && (
        <div className="text-xs text-zinc-500">
          Why it matches: {c.matchReason}
        </div>
      )}
    </div>
  );
}

function ScheduleTab({ extraction }: { extraction: LeaseExtractionBundle }) {
  const rows: AmendmentRow[] = [];

  if (extraction.makeGood?.proposedAmendment) {
    rows.push({
      ref: "Make-good clause",
      focus: "make-good",
      severity:
        extraction.makeGood.severityRating === "bare_shell" ||
        extraction.makeGood.severityRating === "heavy"
          ? "high"
          : "medium",
      current: extraction.makeGood.quotedText ?? "(see make-good clause)",
      proposed: extraction.makeGood.proposedAmendment,
      rationale: extraction.makeGood.concerns.join(" · "),
    });
  }
  if (extraction.outgoings?.proposedAmendment) {
    rows.push({
      ref: "Outgoings clause",
      focus: "outgoings",
      severity:
        extraction.outgoings.excessiveItems.length > 0 ? "high" : "medium",
      current:
        extraction.outgoings.excessiveItems.length > 0
          ? `Includes non-standard items: ${extraction.outgoings.excessiveItems.join(", ")}`
          : "Standard outgoings list",
      proposed: extraction.outgoings.proposedAmendment,
      rationale: "Align with LIV 2023 baseline; cap annual increases.",
    });
  }
  for (const p of extraction.additionalProvisions) {
    if (p.classification === "standard") continue;
    if (!p.proposedAmendment) continue;
    rows.push({
      ref: p.heading ? `${p.number} — ${p.heading}` : p.number,
      focus: p.focusArea.replace(/_/g, " "),
      severity: p.severity,
      current:
        p.fullText.length > 220 ? p.fullText.slice(0, 220) + "…" : p.fullText,
      proposed: p.proposedAmendment,
      rationale: p.amendmentRationale ?? p.tenantImpact,
    });
  }
  rows.sort((a, b) => {
    const r = sevRank(b.severity) - sevRank(a.severity);
    return r !== 0 ? r : a.ref.localeCompare(b.ref);
  });

  if (rows.length === 0) {
    return (
      <div className="text-sm italic text-zinc-400">
        No amendments proposed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Polite-but-firm redlines, ready to send. Cut and paste into a markup.
      </p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div>
                <div className="font-medium text-zinc-900">{r.ref}</div>
                <div className="text-xs text-zinc-500">{r.focus}</div>
              </div>
              <Tag tone={severityTone(r.severity)}>{r.severity}</Tag>
            </div>
            <div className="grid grid-cols-1 gap-4 px-4 py-3 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Current
                </div>
                <blockquote className="whitespace-pre-line text-xs italic text-zinc-700">
                  {r.current}
                </blockquote>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                  Proposed amendment
                </div>
                <div className="whitespace-pre-line rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  {r.proposed}
                </div>
              </div>
            </div>
            {r.rationale && (
              <div className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-600">
                <span className="font-medium">Rationale: </span>
                {r.rationale}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AmendmentRow {
  ref: string;
  focus: string;
  severity: AdditionalProvision["severity"];
  current: string;
  proposed: string;
  rationale: string;
}

function LeaseDetails({
  extraction,
  review,
}: {
  extraction: LeaseExtractionBundle;
  review: LeaseReview;
}) {
  return (
    <div className="space-y-6">
      <Box title="Lease items">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Kv k="Premises" v={extraction.items.premisesAddress} />
          <Kv k="Description" v={extraction.items.premisesDescription} />
          <Kv k="Permitted use" v={extraction.items.permittedUse} />
          <Kv k="Term" v={extraction.items.termDescription} />
          <Kv
            k="Options"
            v={
              extraction.items.optionTerms.length > 0
                ? extraction.items.optionTerms.join(" · ")
                : "—"
            }
          />
          <Kv k="Commencing rent" v={extraction.items.commencingRent?.raw} />
          <Kv
            k="Rent review"
            v={
              extraction.items.rentReview
                ? `${extraction.items.rentReview.method} — ${extraction.items.rentReview.description}${
                    extraction.items.rentReview.ratchetPresent
                      ? " ⚠ ratchet"
                      : ""
                  }`
                : undefined
            }
          />
          <Kv k="Bank guarantee" v={extraction.items.bankGuarantee?.raw} />
          <Kv
            k="Personal guarantee"
            v={
              extraction.items.personalGuarantee
                ? `Yes — ${extraction.items.personalGuarantorNames.join(", ") || "guarantor not named"}`
                : "No"
            }
          />
          <Kv
            k="Parties"
            v={
              <ul className="space-y-0.5">
                {extraction.items.parties.map((p, i) => (
                  <li key={i}>
                    <span className="text-zinc-500">{p.role}:</span> {p.name}
                  </li>
                ))}
              </ul>
            }
          />
        </dl>
      </Box>

      {extraction.classification && (
        <Box title="Retail vs non-retail classification">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Kind:</span>{" "}
              {extraction.classification.kind} · confidence{" "}
              {Math.round(extraction.classification.confidence * 100)}%
            </div>
            <div>
              <span className="font-medium">RLA applies:</span>{" "}
              {extraction.classification.rlaApplies ? "Yes" : "No"}
            </div>
            {extraction.classification.excludedReason && (
              <div>
                <span className="font-medium">Exclusion:</span>{" "}
                {extraction.classification.excludedReason}
              </div>
            )}
            <p className="pt-2 text-zinc-700">
              {extraction.classification.reasoning}
            </p>
          </div>
        </Box>
      )}

      {extraction.makeGood?.present && (
        <Box
          title={`Make-good · ${extraction.makeGood.severityRating ?? "not rated"}`}
        >
          {extraction.makeGood.quotedText && (
            <blockquote className="border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm italic text-zinc-700">
              {extraction.makeGood.quotedText}
            </blockquote>
          )}
          {extraction.makeGood.concerns.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Concerns
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
                {extraction.makeGood.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.makeGood.costRiskNote && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-medium">Cost risk: </span>
              {extraction.makeGood.costRiskNote}
            </div>
          )}
        </Box>
      )}

      {extraction.makeGoodCostBand && (
        <Box title="Make-good — indicative cost band">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-zinc-900">
              {extraction.makeGoodCostBand.estimateLowAud
                ? `$${extraction.makeGoodCostBand.estimateLowAud.toLocaleString("en-AU")}`
                : "—"}
              {" – "}
              {extraction.makeGoodCostBand.estimateHighAud
                ? `$${extraction.makeGoodCostBand.estimateHighAud.toLocaleString("en-AU")}`
                : "open-ended"}
            </span>
            <Tag>{extraction.makeGoodCostBand.band.replace("_", " ")}</Tag>
          </div>
          <p className="mt-2 text-sm text-zinc-700">
            {extraction.makeGoodCostBand.basis}
          </p>
          {extraction.makeGoodCostBand.qsReferralRecommended && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Quantity surveyor referral recommended for a binding estimate.
            </div>
          )}
        </Box>
      )}

      {extraction.outgoings?.payable && (
        <Box
          title={`Outgoings · ${extraction.outgoings.capPresent ? "capped" : "no cap"}`}
        >
          {extraction.outgoings.items.length > 0 && (
            <ul className="divide-y divide-zinc-100">
              {extraction.outgoings.items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 py-2 text-sm"
                >
                  <span>{it.item}</span>
                  <Tag tone={it.standard ? "zinc" : "amber"}>
                    {it.standard ? "standard" : "non-standard"}
                  </Tag>
                </li>
              ))}
            </ul>
          )}
          {extraction.outgoings.excessiveItems.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Items beyond standard LIV 2023 outgoings
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                {extraction.outgoings.excessiveItems.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </Box>
      )}

      {extraction.ongoingObligations.items.length > 0 && (
        <Box
          title={`Ongoing financial obligations · ${extraction.ongoingObligations.items.length}`}
        >
          <ul className="space-y-2 text-sm">
            {extraction.ongoingObligations.items.map((it, i) => (
              <li key={i} className="flex items-start gap-3">
                <Tag tone={severityTone(it.severity)}>{it.severity}</Tag>
                <div>
                  <div className="text-zinc-900">{it.description}</div>
                  <div className="text-xs text-zinc-500">{it.durationNote}</div>
                </div>
              </li>
            ))}
          </ul>
        </Box>
      )}

      {review.marketReviewProjections.length > 0 && (
        <Box
          title={`Rent review projections · ${review.marketReviewProjections.length}`}
        >
          <ul className="space-y-2 text-sm">
            {review.marketReviewProjections.map((p, i) => (
              <ProjectionRow key={i} p={p} />
            ))}
          </ul>
        </Box>
      )}

      {review.optionAnalysis.length > 0 && (
        <Box title={`Option-to-renew analysis · ${review.optionAnalysis.length}`}>
          <ul className="space-y-3">
            {review.optionAnalysis.map((o, i) => (
              <OptionRow key={i} o={o} />
            ))}
          </ul>
        </Box>
      )}

      {review.notificationObligations.length > 0 && (
        <Box
          title={`Landlord notification obligations · ${review.notificationObligations.length}`}
        >
          <ul className="space-y-2 text-sm">
            {review.notificationObligations.map((n, i) => (
              <NotificationRow key={i} n={n} />
            ))}
          </ul>
        </Box>
      )}

      {review.planning && (
        <Box title="Planning & permitted use">
          <PlanningView p={review.planning} />
        </Box>
      )}

      {review.leaseChain && (
        <Box
          title={`Lease chain · ${review.leaseChain.documents.length} document${review.leaseChain.documents.length === 1 ? "" : "s"}${review.leaseChain.chainComplete ? "" : " · gaps"}`}
        >
          <LeaseChainView c={review.leaseChain} />
        </Box>
      )}

      {extraction.livVersion && (
        <Box title="LIV standard-form analysis">
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium">Detected as LIV form: </span>
              {extraction.livVersion.isLiv ? "Yes" : "No"}
            </div>
            {extraction.livVersion.detectedVersion && (
              <div>
                <span className="font-medium">Version: </span>
                {extraction.livVersion.detectedVersion}
              </div>
            )}
            <div>
              <span className="font-medium">Confidence: </span>
              {Math.round(extraction.livVersion.confidence * 100)}%
            </div>
          </div>
        </Box>
      )}
    </div>
  );
}

function ProjectionRow({ p }: { p: MarketReviewProjection }) {
  return (
    <li className="rounded-md border border-zinc-100 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium text-zinc-900">{p.optionTermLabel}</div>
        <div className="text-xs text-zinc-500">{p.basis.replace(/_/g, " ")}</div>
      </div>
      <div className="mt-1 text-zinc-800">
        Baseline {p.baselineRent.raw} → {p.projectedRangeLow.raw} –{" "}
        {p.projectedRangeHigh.raw}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{p.notes}</div>
    </li>
  );
}

function OptionRow({ o }: { o: OptionExerciseAnalysis }) {
  return (
    <li className="rounded-md border border-zinc-100 p-3">
      <div className="text-sm font-semibold text-zinc-900">{o.optionLabel}</div>
      <div className="mt-1 text-xs text-zinc-500">
        Window: {o.exerciseWindowOpens ?? "?"} – {o.exerciseWindowCloses ?? "?"}{" "}
        · Method: {o.exerciseMethod}
      </div>
      {o.tenantRisks.length > 0 && (
        <div className="mt-2 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Tenant risks
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-zinc-700">
            {o.tenantRisks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {o.s28EarlyReviewAvailable && (
          <Tag tone="emerald">s28A early review available</Tag>
        )}
        {o.s28BCoolingOffAvailable && (
          <Tag tone="emerald">s28B cooling-off available</Tag>
        )}
      </div>
    </li>
  );
}

function NotificationRow({ n }: { n: LandlordNotificationObligation }) {
  return (
    <li className="rounded-md border border-zinc-100 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-zinc-900">{n.description}</div>
        <Tag>{n.source}</Tag>
      </div>
      <div className="mt-1 text-xs text-zinc-600">
        <span className="font-medium">Timing: </span>
        {n.timing}
      </div>
      <div className="mt-0.5 text-xs text-zinc-600">
        <span className="font-medium">If failed: </span>
        {n.consequenceOfFailure}
      </div>
    </li>
  );
}

function PlanningView({ p }: { p: PlanningCompliance }) {
  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-medium">Zone: </span>
        {p.zone}
      </div>
      <div>
        <span className="font-medium">Permitted use allowed: </span>
        {p.permittedUseAllowed}
      </div>
      {p.permitTriggers.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Permit triggers
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-zinc-700">
            {p.permitTriggers.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {p.concerns.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Concerns
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-zinc-700">
            {p.concerns.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LeaseChainView({ c }: { c: LeaseChainAnalysis }) {
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-1">
        {c.documents.map((d) => (
          <li key={d.order} className="flex items-baseline gap-2">
            <span className="font-mono text-xs tabular-nums text-zinc-500">
              {String(d.order).padStart(2, "0")}
            </span>
            <Tag>{d.kind.replace(/_/g, " ")}</Tag>
            <span className="text-zinc-800">{d.sourceFilename}</span>
          </li>
        ))}
      </ol>
      {c.missingDocuments.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-medium">Possibly missing</div>
          <ul className="mt-1 ml-4 list-disc">
            {c.missingDocuments.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Box({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h3>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {k}
      </dt>
      <dd className="mt-0.5 text-zinc-900">{v ?? "—"}</dd>
    </div>
  );
}

function Tag({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "amber" | "red" | "emerald" | "orange";
}) {
  const styles = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-900 ring-red-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    orange: "bg-orange-50 text-orange-900 ring-orange-200",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
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

function sevRank(s: string): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[
    s as "critical" | "high" | "medium" | "low" | "info"
  ] ?? 0;
}
