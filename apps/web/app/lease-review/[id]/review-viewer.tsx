"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  AdditionalProvision,
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

interface Stage {
  status: LeaseReviewStatus;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

const STAGES: Stage[] = [
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
    sub: "Mandatory protections, then landlord-breach voids (high-value findings)",
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

export function LeaseReviewViewer({ initial }: { initial: LeaseReview }) {
  const [review, setReview] = useState<LeaseReview>(initial);
  const [letterStream, setLetterStream] = useState<string>("");
  const [stageStart, setStageStart] = useState<Record<string, number>>({});
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const [eventCount, setEventCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (review.status === "complete" || review.status === "failed") return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [review.status]);

  useEffect(() => {
    setStageStart((prev) =>
      prev[review.status] ? prev : { ...prev, [review.status]: Date.now() },
    );
  }, [review.status]);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/lease-review/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setEventCount((c) => c + 1);
        setLastEventAt(Date.now());
        if (data.type === "review") setReview(data.review as LeaseReview);
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
  const recentEvent = now - lastEventAt < 5000;

  const extraction = review.extraction;

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link
            href="/lease"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            &larr; Lease module
          </Link>
          <div className="mt-2 text-xs font-semibold tracking-widest uppercase text-zinc-500">
            Lease review · {review.id.slice(0, 8)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {extraction?.items.premisesAddress ?? "(premises pending)"}
          </h1>
          {extraction?.classification && (
            <div className="mt-1 text-sm text-zinc-600">
              <span
                className={
                  extraction.classification.rlaApplies
                    ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200"
                    : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200"
                }
              >
                {extraction.classification.kind.replace("_", "-")}
                {extraction.classification.rlaApplies
                  ? " · RLA applies"
                  : " · RLA does not apply"}
              </span>
            </div>
          )}
        </div>
        <div className="text-right text-sm text-zinc-500">
          <div>
            Total <span className="font-mono tabular-nums">{fmtMs(totalElapsedSec * 1000)}</span>
          </div>
          {!complete && !failed && (
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${recentEvent ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`}
              />
              <span className="font-mono tabular-nums">
                {eventCount} events{" "}
                {!recentEvent && `· quiet ${Math.floor((now - lastEventAt) / 1000)}s`}
              </span>
            </div>
          )}
        </div>
      </header>

      {failed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          <div className="font-semibold">Pipeline failed</div>
          <div className="mt-1 text-sm">{review.error}</div>
        </div>
      )}

      {/* Headline risk banner — only when extraction is in (post-pass-2) */}
      {extraction && complete && <HeadlineRisk review={review} />}

      {/* Pipeline stepper */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-sm font-semibold text-zinc-900">Pipeline</div>
        <ol className="space-y-4">
          {STAGES.map((s, i) => {
            const state: "done" | "active" | "pending" =
              stageIdx > i + 1 || complete
                ? "done"
                : stageIdx === i + 1 && !complete
                  ? "active"
                  : "pending";
            const progress = progressByPass[i + 1];
            const started = stageStart[s.status];
            return (
              <li key={s.status} className="flex gap-4">
                <StageIcon state={state} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          state === "done"
                            ? "font-medium text-zinc-900"
                            : state === "active"
                              ? "font-semibold text-zinc-900"
                              : "text-zinc-400"
                        }
                      >
                        {s.label}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                        {s.model}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 font-mono tabular-nums">
                      {state === "active" && started
                        ? fmtMs(now - started)
                        : state === "done"
                          ? "done"
                          : s.typical}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{s.sub}</div>
                  {state === "active" && progress && (
                    <div className="mt-2 text-xs text-zinc-700">
                      {progress.message}
                      {typeof progress.current === "number" &&
                        typeof progress.total === "number" && (
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className="h-full bg-zinc-900 transition-all"
                              style={{
                                width: `${Math.round(
                                  (progress.current / progress.total) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Classification panel */}
      {extraction?.classification && (
        <Panel title="Retail vs non-retail classification">
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
            <div className="pt-2 text-zinc-700">
              {extraction.classification.reasoning}
            </div>
          </div>
        </Panel>
      )}

      {/* Items panel */}
      {extraction?.items && (
        <Panel title="Lease items">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
            <Kv
              k="Commencing rent"
              v={extraction.items.commencingRent?.raw}
            />
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
            <Kv
              k="Bank guarantee"
              v={extraction.items.bankGuarantee?.raw}
            />
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
                      <span className="text-zinc-500">{p.role}:</span>{" "}
                      {p.name}
                    </li>
                  ))}
                </ul>
              }
            />
          </dl>
        </Panel>
      )}

      {/* Make-good panel */}
      {extraction?.makeGood && extraction.makeGood.present && (
        <Panel title={`Make-good · ${extraction.makeGood.severityRating ?? "not rated"}`}>
          {extraction.makeGood.quotedText && (
            <blockquote className="border-l-4 border-zinc-200 bg-zinc-50 px-4 py-2 text-sm italic text-zinc-700">
              {extraction.makeGood.quotedText}
            </blockquote>
          )}
          {extraction.makeGood.concerns.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium text-zinc-900">Concerns</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                {extraction.makeGood.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.makeGood.costRiskNote && (
            <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <span className="font-medium">Cost risk: </span>
              {extraction.makeGood.costRiskNote}
            </div>
          )}
          {extraction.makeGood.proposedAmendment && (
            <div className="mt-3 rounded-md bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
              <div className="font-medium">Proposed amendment</div>
              <div className="mt-1">{extraction.makeGood.proposedAmendment}</div>
            </div>
          )}
        </Panel>
      )}

      {/* Outgoings panel */}
      {extraction?.outgoings && extraction.outgoings.payable && (
        <Panel title={`Outgoings · ${extraction.outgoings.capPresent ? "capped" : "no cap"}`}>
          {extraction.outgoings.items.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {extraction.outgoings.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <span>{it.item}</span>
                  <span
                    className={
                      it.standard
                        ? "shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
                        : "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                    }
                  >
                    {it.standard ? "standard" : "non-standard"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {extraction.outgoings.excessiveItems.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium text-zinc-900">
                Items beyond standard LIV 2023 outgoings
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
                {extraction.outgoings.excessiveItems.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.outgoings.proposedAmendment && (
            <div className="mt-3 rounded-md bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
              <div className="font-medium">Proposed amendment</div>
              <div className="mt-1">{extraction.outgoings.proposedAmendment}</div>
            </div>
          )}
        </Panel>
      )}

      {/* Ongoing obligations */}
      {extraction?.ongoingObligations.items.length ? (
        <Panel title={`Ongoing financial obligations · ${extraction.ongoingObligations.items.length}`}>
          <ul className="space-y-2 text-sm">
            {extraction.ongoingObligations.items.map((it, i) => (
              <li key={i} className="flex items-start gap-3">
                <SeverityPill severity={it.severity} />
                <div>
                  <div className="text-zinc-900">{it.description}</div>
                  <div className="text-xs text-zinc-500">{it.durationNote}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Additional provisions */}
      {extraction?.additionalProvisions && extraction.additionalProvisions.length > 0 && (
        <Panel
          title={`Additional provisions · ${extraction.additionalProvisions.length} (${extraction.additionalProvisions.filter((p) => p.classification !== "standard").length} non-standard)`}
        >
          <ul className="space-y-4">
            {extraction.additionalProvisions
              .slice()
              .sort((a, b) => rank(b.classification) - rank(a.classification))
              .map((p) => (
                <ProvisionCard key={p.number} p={p} />
              ))}
          </ul>
        </Panel>
      )}

      {/* Schedule of proposed amendments — table view, copy-paste ready */}
      {extraction && complete && (
        <AmendmentsScheduleSection extraction={extraction} />
      )}

      {/* RLA compliance */}
      {review.rlaCompliance.length > 0 && (
        <Panel title={`RLA compliance · ${review.rlaCompliance.length} findings`}>
          <ul className="space-y-2 text-sm">
            {review.rlaCompliance.map((f) => (
              <li key={f.ruleId} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-zinc-900">{f.title}</div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={f.status} />
                    <SeverityPill severity={f.severity} />
                  </div>
                </div>
                <div className="mt-1 text-zinc-700">{f.explanation}</div>
                {f.citations.length > 0 && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {f.citations.map((c, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {c.act} s {c.section}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Unenforceability — HIGHEST VALUE: landlord breaches that void clauses */}
      {review.unenforceability && review.unenforceability.length > 0 && (
        <Panel
          title={`Void / unenforceable clauses · ${review.unenforceability.length} finding${review.unenforceability.length === 1 ? "" : "s"} · landlord non-compliance`}
        >
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-900">
            <span className="font-semibold">High-value findings.</span> Each row
            below identifies a landlord breach of the Retail Leases Act that
            renders one or more lease provisions void or removes the tenant's
            liability to pay until remedied. Verify with the solicitor before
            relying on any.
          </div>
          <UnenforceabilityTable findings={review.unenforceability} />
        </Panel>
      )}

      {/* Make-good cost band */}
      {extraction?.makeGoodCostBand && (
        <Panel title="Make-good — indicative cost band">
          <div className="text-sm">
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
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                {extraction.makeGoodCostBand.band.replace("_", " ")}
              </span>
            </div>
            <div className="mt-2 text-zinc-700">
              {extraction.makeGoodCostBand.basis}
            </div>
            {extraction.makeGoodCostBand.qsReferralRecommended && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                Quantity surveyor referral recommended for a binding estimate.
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Market review projections */}
      {review.marketReviewProjections &&
        review.marketReviewProjections.length > 0 && (
          <Panel
            title={`Rent review projections · ${review.marketReviewProjections.length}`}
          >
            <ul className="space-y-2 text-sm">
              {review.marketReviewProjections.map((p, i) => (
                <ProjectionCard key={i} p={p} />
              ))}
            </ul>
          </Panel>
        )}

      {/* Option exercise analysis */}
      {review.optionAnalysis && review.optionAnalysis.length > 0 && (
        <Panel
          title={`Option-to-renew analysis · ${review.optionAnalysis.length}`}
        >
          <ul className="space-y-3">
            {review.optionAnalysis.map((o, i) => (
              <OptionCard key={i} o={o} />
            ))}
          </ul>
        </Panel>
      )}

      {/* Notification obligations */}
      {review.notificationObligations &&
        review.notificationObligations.length > 0 && (
          <Panel
            title={`Landlord notification obligations · ${review.notificationObligations.length}`}
          >
            <ul className="space-y-2 text-sm">
              {review.notificationObligations.map((n, i) => (
                <NotificationCard key={i} n={n} />
              ))}
            </ul>
          </Panel>
        )}

      {/* Planning */}
      {review.planning && (
        <Panel title="Planning & permitted use">
          <PlanningPanel p={review.planning} />
        </Panel>
      )}

      {/* Lease chain */}
      {review.leaseChain && (
        <Panel
          title={`Lease chain · ${review.leaseChain.documents.length} document${review.leaseChain.documents.length === 1 ? "" : "s"}${review.leaseChain.chainComplete ? "" : " · gaps"}`}
        >
          <LeaseChainPanel c={review.leaseChain} />
        </Panel>
      )}

      {/* LIV version */}
      {extraction?.livVersion && (
        <Panel title="LIV standard-form analysis">
          <div className="text-sm space-y-1">
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
            {extraction.livVersion.deltas.length > 0 ? (
              <div className="mt-2 text-xs text-zinc-500">
                Clause-by-clause deltas against {extraction.livVersion.comparisonAgainst}
                : {extraction.livVersion.deltas.length}
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">
                v1 detection only; clause-by-clause delta against the LIV 2023 baseline
                arrives in v1.5.
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Streaming letter */}
      {(letterStream || review.letter) && (
        <Panel title="Letter of advice">
          <article className="prose prose-zinc max-w-none whitespace-pre-wrap text-sm text-zinc-800">
            {review.letter
              ? review.letter.sections
                  .map((s) => `## ${s.heading}\n\n${s.markdown}`)
                  .join("\n\n")
              : letterStream}
          </article>
        </Panel>
      )}
    </div>
  );
}

const EFFECT_LABEL: Record<UnenforceabilityFinding["effect"], string> = {
  void: "Void",
  not_liable_until_remedied: "Not liable until remedied",
  right_to_recover: "Right to recover",
  right_to_terminate: "Right to terminate",
  right_to_withhold: "Right to withhold",
};

const SEV_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as const;

function UnenforceabilityTable({ findings }: { findings: UnenforceabilityFinding[] }) {
  type SortKey = "severity" | "exposure" | "section";
  const [sort, setSort] = useState<SortKey>("severity");
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = [...findings].sort((a, b) => {
    if (sort === "exposure") {
      return (b.estimatedExposureAud ?? -1) - (a.estimatedExposureAud ?? -1);
    }
    if (sort === "section") {
      return a.trigger.section.localeCompare(b.trigger.section, "en", { numeric: true });
    }
    const r =
      (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0);
    return r !== 0 ? r : b.confidence - a.confidence;
  });

  const totalExposure = findings.reduce(
    (acc, f) => acc + (typeof f.estimatedExposureAud === "number" ? f.estimatedExposureAud : 0),
    0,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-600">
          <tr>
            <SortHeader label="Section" active={sort === "section"} onClick={() => setSort("section")} />
            <th className="px-3 py-2 text-left font-medium">Effect</th>
            <SortHeader label="Sev." active={sort === "severity"} onClick={() => setSort("severity")} />
            <th className="px-3 py-2 text-left font-medium">Affected clauses</th>
            <SortHeader
              label="Exposure"
              active={sort === "exposure"}
              onClick={() => setSort("exposure")}
              align="right"
            />
            <th className="px-3 py-2 text-right font-medium">Conf.</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {sorted.map((f) => {
            const open = openId === f.ruleId;
            return (
              <>
                <tr
                  key={f.ruleId}
                  className="cursor-pointer hover:bg-zinc-50"
                  onClick={() => setOpenId(open ? null : f.ruleId)}
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-zinc-900">
                      s {f.trigger.section}
                    </div>
                    <div className="text-xs text-zinc-500">{f.trigger.act}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
                      {EFFECT_LABEL[f.effect]}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <SeverityPill severity={f.severity} />
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-zinc-700">
                    {f.affectedClauses.length > 0 ? f.affectedClauses.join(" · ") : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {typeof f.estimatedExposureAud === "number" ? (
                      <span className="font-medium text-emerald-900">
                        ${f.estimatedExposureAud.toLocaleString("en-AU")}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-xs tabular-nums">
                    {Math.round(f.confidence * 100)}%
                    {f.needsLawyerConfirm && (
                      <div className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                        confirm
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-zinc-400">
                    {open ? "▾" : "▸"}
                  </td>
                </tr>
                {open && (
                  <tr key={f.ruleId + "-detail"} className="bg-zinc-50/60">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            Landlord failure
                          </div>
                          <div className="mt-1 text-sm text-zinc-800">
                            {f.landlordFailure}
                          </div>
                          {f.evidence.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                Evidence
                              </div>
                              <ul className="mt-1 space-y-1">
                                {f.evidence.map((e, i) => (
                                  <li
                                    key={i}
                                    className="border-l-4 border-zinc-300 bg-white px-3 py-1 text-xs italic text-zinc-700"
                                  >
                                    {e}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {f.detectionSignals.length > 0 && (
                            <div className="mt-3 text-xs text-zinc-500">
                              <span className="font-medium">Detected via: </span>
                              {f.detectionSignals.join(" · ")}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
                            <div className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                              Remedy for tenant
                            </div>
                            <div className="mt-1 whitespace-pre-line">
                              {f.remedyForTenant}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        {totalExposure > 0 && (
          <tfoot>
            <tr className="bg-emerald-50 text-sm font-semibold text-emerald-900">
              <td colSpan={4} className="px-3 py-2 text-right">
                Total quantified exposure
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                ${totalExposure.toLocaleString("en-AU")}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SortHeader({
  label,
  active,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  align?: "right";
}) {
  return (
    <th
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} font-medium`}
    >
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${active ? "text-zinc-900" : ""}`}
      >
        {label}
        {active && <span className="text-[10px]">▾</span>}
      </button>
    </th>
  );
}

function ProjectionCard({ p }: { p: MarketReviewProjection }) {
  return (
    <li className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium text-zinc-900">{p.optionTermLabel}</div>
        <div className="text-xs text-zinc-500">{p.basis.replace(/_/g, " ")}</div>
      </div>
      <div className="mt-1 text-zinc-800">
        Baseline {p.baselineRent.raw} → {p.projectedRangeLow.raw} – {p.projectedRangeHigh.raw}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{p.notes}</div>
    </li>
  );
}

function OptionCard({ o }: { o: OptionExerciseAnalysis }) {
  return (
    <li className="rounded-md border border-zinc-200 p-4">
      <div className="text-sm font-semibold text-zinc-900">{o.optionLabel}</div>
      <div className="mt-1 text-xs text-zinc-500">
        Window:{" "}
        {o.exerciseWindowOpens ?? "?"} – {o.exerciseWindowCloses ?? "?"} ·{" "}
        Method: {o.exerciseMethod}
      </div>
      {o.tenantRisks.length > 0 && (
        <div className="mt-2 text-sm">
          <div className="text-xs font-medium text-zinc-500">Tenant risks</div>
          <ul className="mt-0.5 list-disc pl-5 text-zinc-700">
            {o.tenantRisks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {o.landlordRisks.length > 0 && (
        <div className="mt-2 text-sm">
          <div className="text-xs font-medium text-zinc-500">Landlord risks (timing breaches)</div>
          <ul className="mt-0.5 list-disc pl-5 text-zinc-700">
            {o.landlordRisks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {o.s28EarlyReviewAvailable && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
            s28A early review available
          </span>
        )}
        {o.s28BCoolingOffAvailable && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
            s28B cooling-off available
          </span>
        )}
      </div>
    </li>
  );
}

function NotificationCard({ n }: { n: LandlordNotificationObligation }) {
  return (
    <li className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-zinc-900">{n.description}</div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
          {n.source}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-600">
        <span className="font-medium">Timing: </span>
        {n.timing}
      </div>
      <div className="mt-0.5 text-xs text-zinc-600">
        <span className="font-medium">If failed: </span>
        {n.consequenceOfFailure}
      </div>
      {n.citation && (
        <div className="mt-1 text-xs text-zinc-500">
          {n.citation.act} s {n.citation.section}
        </div>
      )}
    </li>
  );
}

function PlanningPanel({ p }: { p: PlanningCompliance }) {
  return (
    <div className="text-sm space-y-2">
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
          <div className="text-xs font-medium text-zinc-500">Permit triggers</div>
          <ul className="mt-0.5 list-disc pl-5 text-zinc-700">
            {p.permitTriggers.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {p.concerns.length > 0 && (
        <div>
          <div className="text-xs font-medium text-zinc-500">Concerns</div>
          <ul className="mt-0.5 list-disc pl-5 text-zinc-700">
            {p.concerns.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LeaseChainPanel({ c }: { c: LeaseChainAnalysis }) {
  return (
    <div className="text-sm space-y-3">
      <ol className="space-y-1">
        {c.documents.map((d) => (
          <li key={d.order} className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-zinc-500 tabular-nums">
              {String(d.order).padStart(2, "0")}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {d.kind.replace(/_/g, " ")}
            </span>
            <span className="text-zinc-800">{d.sourceFilename}</span>
          </li>
        ))}
      </ol>
      {c.missingDocuments.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <div className="font-medium">Possibly missing</div>
          <ul className="mt-1 list-disc pl-5">
            {c.missingDocuments.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {c.inconsistencies.length > 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-900">
          <div className="font-medium">Inconsistencies</div>
          <ul className="mt-1 list-disc pl-5">
            {c.inconsistencies.map((m, i) => (
              <li key={i}>
                <span className="font-medium">[{m.severity}] </span>
                {m.description}
                {m.documentRefs.length > 0 && (
                  <span className="text-zinc-600"> ({m.documentRefs.join(", ")})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function rank(c: AdditionalProvision["classification"]): number {
  switch (c) {
    case "rla_conflict":
      return 5;
    case "tenant_adverse":
      return 4;
    case "landlord_favoured":
      return 3;
    case "unusual":
      return 2;
    case "standard":
      return 1;
  }
}

function ProvisionCard({ p }: { p: AdditionalProvision }) {
  const nonStandard = p.classification !== "standard";
  return (
    <li className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">
            {p.number}
            {p.heading ? ` — ${p.heading}` : ""}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {p.focusArea.replace(/_/g, " ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ClassPill c={p.classification} />
          <SeverityPill severity={p.severity} />
        </div>
      </div>
      <div className="mt-2 text-sm text-zinc-800">{p.summary}</div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900">
          View clause text
        </summary>
        <blockquote className="mt-2 border-l-4 border-zinc-200 bg-zinc-50 px-3 py-2 text-xs italic text-zinc-700">
          {p.fullText}
        </blockquote>
      </details>
      <div className="mt-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Tenant impact: </span>
        {p.tenantImpact}
      </div>
      {nonStandard && p.proposedAmendment && (
        <div className="mt-3 rounded-md bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
          <div className="font-medium">Proposed amendment</div>
          <div className="mt-1">{p.proposedAmendment}</div>
          {p.amendmentRationale && (
            <div className="mt-1 text-xs text-sky-800">
              Rationale: {p.amendmentRationale}
            </div>
          )}
        </div>
      )}
    </li>
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

function AmendmentsScheduleSection({ extraction }: { extraction: LeaseExtractionBundle }) {
  const rows: AmendmentRow[] = [];

  // Make-good amendment
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

  // Outgoings amendment
  if (extraction.outgoings?.proposedAmendment) {
    rows.push({
      ref: "Outgoings clause",
      focus: "outgoings",
      severity: extraction.outgoings.excessiveItems.length > 0 ? "high" : "medium",
      current:
        extraction.outgoings.excessiveItems.length > 0
          ? `Includes non-standard items: ${extraction.outgoings.excessiveItems.join(", ")}`
          : "Standard outgoings list",
      proposed: extraction.outgoings.proposedAmendment,
      rationale: "Align with LIV 2023 baseline; cap annual increases.",
    });
  }

  // Provision amendments
  for (const p of extraction.additionalProvisions) {
    if (p.classification === "standard") continue;
    if (!p.proposedAmendment) continue;
    rows.push({
      ref: p.heading ? `${p.number} — ${p.heading}` : p.number,
      focus: p.focusArea.replace(/_/g, " "),
      severity: p.severity,
      current: p.fullText.length > 220 ? p.fullText.slice(0, 220) + "…" : p.fullText,
      proposed: p.proposedAmendment,
      rationale: p.amendmentRationale ?? p.tenantImpact,
    });
  }

  if (rows.length === 0) return null;

  // Sort by severity, then by ref
  rows.sort((a, b) => {
    const r = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0);
    return r !== 0 ? r : a.ref.localeCompare(b.ref);
  });

  return (
    <Panel title={`Schedule of proposed amendments · ${rows.length}`}>
      <div className="mb-3 text-xs text-zinc-600">
        Polite-but-firm redlines, ready to send. Cut and paste into a markup.
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="w-10 px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Clause</th>
              <th className="px-3 py-2 text-left font-medium">Sev.</th>
              <th className="px-3 py-2 text-left font-medium">Current</th>
              <th className="px-3 py-2 text-left font-medium">Proposed amendment</th>
              <th className="px-3 py-2 text-left font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-3 text-xs font-mono tabular-nums text-zinc-500">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-zinc-900">{r.ref}</div>
                  <div className="text-xs text-zinc-500">{r.focus}</div>
                </td>
                <td className="px-3 py-3">
                  <SeverityPill severity={r.severity} />
                </td>
                <td className="px-3 py-3 max-w-xs text-xs text-zinc-700">
                  <div className="line-clamp-4 whitespace-pre-line italic">
                    {r.current}
                  </div>
                </td>
                <td className="px-3 py-3 max-w-md text-xs text-sky-900">
                  <div className="rounded-md bg-sky-50 border border-sky-200 px-2 py-1 whitespace-pre-line">
                    {r.proposed}
                  </div>
                </td>
                <td className="px-3 py-3 max-w-xs text-xs text-zinc-600">
                  {r.rationale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function HeadlineRisk({ review }: { review: LeaseReview }) {
  const findings = review.unenforceability ?? [];
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const exposure = findings.reduce(
    (acc, f) => acc + (typeof f.estimatedExposureAud === "number" ? f.estimatedExposureAud : 0),
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

  // Verdict logic — simple rule of thumb
  let verdict: { label: string; cls: string };
  if (critical > 0 || mustFix.length >= 2) {
    verdict = {
      label: "Do not sign without amendments",
      cls: "bg-red-100 text-red-900 ring-red-300",
    };
  } else if (high > 0 || mustFix.length === 1) {
    verdict = {
      label: "Sign only after key amendments",
      cls: "bg-amber-100 text-amber-900 ring-amber-300",
    };
  } else {
    verdict = {
      label: "Acceptable with standard amendments",
      cls: "bg-emerald-100 text-emerald-900 ring-emerald-300",
    };
  }

  return (
    <section className="rounded-xl border-2 border-zinc-900 bg-white p-6 shadow-md">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          At a glance
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-2 ring-inset ${verdict.cls}`}
        >
          {verdict.label}
        </span>
      </div>
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
          sub={mg?.qsReferralRecommended ? "QS referral recommended" : (mg?.band ?? "")}
          tone={mg?.band === "bare_shell" || mg?.band === "heavy" ? "red" : "neutral"}
        />
        <Metric
          k="Non-standard clauses"
          v={String(provisions.filter((p) => p.classification !== "standard").length)}
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
                <span className="font-mono text-xs text-zinc-500">{p.number}</span>
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
      <div className="text-xs font-medium text-zinc-500">{k}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>{v}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{k}</dt>
      <dd className="mt-0.5 text-zinc-900">{v ?? "—"}</dd>
    </div>
  );
}

function StageIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done")
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs text-white">
        ✓
      </span>
    );
  if (state === "active")
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-zinc-900 border-t-transparent animate-spin" />
    );
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300" />
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-red-100 text-red-900 ring-red-200"
      : severity === "high"
        ? "bg-amber-100 text-amber-900 ring-amber-200"
        : severity === "medium"
          ? "bg-yellow-100 text-yellow-900 ring-yellow-200"
          : severity === "low"
            ? "bg-zinc-100 text-zinc-700 ring-zinc-200"
            : "bg-zinc-50 text-zinc-600 ring-zinc-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${cls}`}
    >
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "pass"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : status === "fail"
        ? "bg-red-100 text-red-900 ring-red-200"
        : status === "warning"
          ? "bg-amber-100 text-amber-900 ring-amber-200"
          : "bg-zinc-100 text-zinc-700 ring-zinc-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}

function ClassPill({ c }: { c: AdditionalProvision["classification"] }) {
  const cls =
    c === "rla_conflict"
      ? "bg-red-100 text-red-900 ring-red-200"
      : c === "tenant_adverse"
        ? "bg-amber-100 text-amber-900 ring-amber-200"
        : c === "landlord_favoured"
          ? "bg-yellow-100 text-yellow-900 ring-yellow-200"
          : c === "unusual"
            ? "bg-sky-100 text-sky-900 ring-sky-200"
            : "bg-emerald-100 text-emerald-900 ring-emerald-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${cls}`}
    >
      {c.replace(/_/g, " ")}
    </span>
  );
}
