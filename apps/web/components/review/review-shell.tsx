"use client";

import type { ReactNode } from "react";
import { LetterPane } from "./letter-pane";
import {
  FindingsAccordion,
  type FindingsGroup,
} from "./findings-accordion";
import { PipelineProgress, type PipelineStage } from "./pipeline-progress";
import { Tabs, type TabDef } from "./tabs";
import {
  fmtMs,
  type PipelineProgressEvent,
  type StreamConnection,
} from "./use-review-stream";

export interface ExportLink {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface DeliverableConfig {
  /** Tab label, e.g. "Letter of advice", "Schedule of amendments". */
  label: string;
  sections?: { heading: string; markdown: string }[];
  streamMarkdown?: string;
  streaming?: boolean;
  emptyHint?: string;
  streamingHint?: string;
}

/**
 * Generic review viewer shell — used by every module's review page so they
 * share the same tabbed layout (Overview · Letter · Findings · Particulars),
 * sticky-TOC letter rendering, and severity-grouped accordion findings.
 *
 * Module-specific bits (different particulars shape, different finding types,
 * different deliverable name) are passed in as props rather than baked here.
 */
export function ReviewShell({
  // Header
  eyebrow,
  title,
  subtitle,
  exportLinks,
  jurisdictionTag,

  // Pipeline state
  status,
  errorText,
  stages,
  stageIdx,
  stageStart,
  now,
  progressByPass,
  eventCount,
  lastEventAt,
  totalElapsedSec,
  connection,

  // Tab content
  deliverable,
  findingsGroups,
  particulars,
  overview,
  extraTabs,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  exportLinks?: ExportLink[];
  jurisdictionTag?: string;

  status: string;
  errorText?: string;
  stages: PipelineStage[];
  stageIdx: number;
  stageStart: Record<string, number>;
  now: number;
  progressByPass: Record<number, PipelineProgressEvent>;
  eventCount: number;
  lastEventAt: number;
  totalElapsedSec: number;
  connection?: StreamConnection;

  deliverable: DeliverableConfig;
  findingsGroups: FindingsGroup[];
  particulars: ReactNode;
  overview?: ReactNode;
  extraTabs?: { def: TabDef; render: () => ReactNode }[];
}) {
  const complete = status === "complete";
  const failed = status === "failed";
  const totalFindings = findingsGroups.reduce(
    (acc, g) => acc + g.items.length,
    0,
  );

  const tabs: TabDef[] = [
    ...(overview ? [{ id: "overview", label: "Overview" }] : []),
    { id: "letter", label: deliverable.label },
    { id: "findings", label: "Findings", count: totalFindings },
    { id: "particulars", label: "Particulars" },
    ...(extraTabs?.map((t) => t.def) ?? []),
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            <span>{eyebrow}</span>
            {jurisdictionTag && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="text-zinc-600">{jurisdictionTag}</span>
              </>
            )}
            {complete && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  complete
                </span>
              </>
            )}
            {failed && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="inline-flex items-center gap-1 text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  failed
                </span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-sm text-zinc-500">{subtitle}</div>
          )}
        </div>
        {complete && exportLinks && exportLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {exportLinks.map((link, i) => (
              <a
                key={link.label}
                href={link.href}
                className={`inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  (link.variant ?? (i === 0 ? "primary" : "secondary")) ===
                  "primary"
                    ? "bg-zinc-900 text-white hover:bg-zinc-800"
                    : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {!complete && !failed && connection === "reconnecting" && (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Connection lost — reconnecting… The review keeps running on the
          server; this page will catch up automatically.
        </div>
      )}

      {!complete && !failed && (
        <PipelineProgress
          stages={stages}
          stageIdx={stageIdx}
          stageStart={stageStart}
          now={now}
          progressByPass={progressByPass}
          eventCount={eventCount}
          lastEventAt={lastEventAt}
          totalElapsedSec={totalElapsedSec}
        />
      )}

      {failed && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="mb-1 font-semibold">Pipeline failed</div>
          <div className="whitespace-pre-wrap font-mono text-xs">
            {errorText || "No error detail was recorded. Try starting the review again."}
          </div>
        </div>
      )}

      <Tabs tabs={tabs}>
        {(active) => {
          if (active === "overview" && overview) return overview;
          if (active === "letter") {
            return (
              <LetterPane
                sections={deliverable.sections}
                streamMarkdown={deliverable.streamMarkdown}
                streaming={deliverable.streaming}
                streamingHint={deliverable.streamingHint}
                emptyHint={deliverable.emptyHint}
              />
            );
          }
          if (active === "findings") {
            return <FindingsAccordion groups={findingsGroups} />;
          }
          if (active === "particulars") {
            return <div className="max-w-3xl">{particulars}</div>;
          }
          const extra = extraTabs?.find((t) => t.def.id === active);
          if (extra) return extra.render();
          return null;
        }}
      </Tabs>
    </div>
  );
}

export { fmtMs };
