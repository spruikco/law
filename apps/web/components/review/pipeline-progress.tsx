"use client";

import { fmtMs, type PipelineProgressEvent } from "./use-review-stream";

export interface PipelineStage {
  /** Status string that activates this stage. */
  status: string;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

export function PipelineProgress({
  stages,
  stageIdx,
  stageStart,
  now,
  progressByPass,
  eventCount,
  lastEventAt,
  totalElapsedSec,
}: {
  stages: PipelineStage[];
  stageIdx: number;
  stageStart: Record<string, number>;
  now: number;
  progressByPass: Record<number, PipelineProgressEvent>;
  eventCount: number;
  lastEventAt: number;
  totalElapsedSec: number;
}) {
  const sinceLast = Math.max(0, Math.floor((now - lastEventAt) / 1000));
  const live = now - lastEventAt < 2000;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Pipeline
          </h2>
          <span className="text-xs text-zinc-400">·</span>
          <span className="text-xs text-zinc-500">
            {fmtMs(totalElapsedSec * 1000)} elapsed
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"
              }`}
            />
            {live ? "live" : `quiet ${sinceLast}s`}
          </span>
          <span>·</span>
          <span className="tabular-nums">
            {eventCount} event{eventCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <ol className="divide-y divide-zinc-100">
        {stages.map((s, i) => {
          const passNum = i + 1;
          const state =
            stageIdx > passNum
              ? "done"
              : stageIdx === passNum
                ? "active"
                : "pending";
          const start = stageStart[s.status];
          const elapsed =
            state === "active" && start ? now - start : undefined;
          const progress = progressByPass[passNum];
          return (
            <li key={s.status} className="flex gap-4 px-5 py-3.5">
              <StageIcon state={state} number={passNum} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-medium ${
                        state === "pending" ? "text-zinc-400" : "text-zinc-900"
                      }`}
                    >
                      {s.label}
                    </span>
                    <span className="text-xs text-zinc-400">{s.model}</span>
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {state === "active" && elapsed !== undefined
                      ? fmtMs(elapsed)
                      : state === "pending"
                        ? s.typical
                        : state === "done"
                          ? "done"
                          : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">{s.sub}</div>
                {state === "active" && progress && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-900">
                    <span className="h-1 w-1 rounded-full bg-zinc-900 animate-pulse" />
                    <span className="truncate">{progress.message}</span>
                    {progress.total ? (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span className="block h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                          <span
                            className="block h-full bg-zinc-900 transition-[width]"
                            style={{
                              width: `${Math.round(((progress.current ?? 0) / progress.total) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="tabular-nums text-zinc-500">
                          {progress.current}/{progress.total}
                        </span>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageIcon({
  state,
  number,
}: {
  state: "done" | "active" | "pending";
  number: number;
}) {
  if (state === "done") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center">
        <svg className="h-5 w-5 animate-spin text-zinc-900" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="3"
          />
          <path
            d="M22 12a10 10 0 0 1-10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-xs tabular-nums text-zinc-400">
      {number}
    </span>
  );
}
