"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Review, ReviewStatus, ComplianceFinding, RiskFinding } from "@law/schema";

interface Stage {
  status: ReviewStatus;
  label: string;
  sub: string;
  model: string;
  typical: string;
}

const STAGES: Stage[] = [
  { status: "classifying", label: "Classify documents", sub: "Identify CoS / s32 / supporting PDFs", model: "Claude Sonnet 4.6", typical: "~10s" },
  { status: "extracting", label: "Extract structured data", sub: "Particulars, special conditions, OC, title, tax certs", model: "Claude Sonnet 4.6", typical: "~25s" },
  { status: "checking_compliance", label: "Check compliance", sub: "Run every mandatory rule against extracted data + RAG", model: "Claude Sonnet 4.6", typical: "~60s" },
  { status: "analysing_risk", label: "Analyse risk", sub: "Conditions precedent · risky SCs · GC variations · tax triggers", model: "Claude Opus 4.6", typical: "~2m" },
  { status: "composing_letter", label: "Compose letter of advice", sub: "Stream a lawyer-reviewable letter", model: "Claude Opus 4.6", typical: "~2m" },
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

interface ProgressEvent {
  message: string;
  current?: number;
  total?: number;
  pass: number;
}

export function ReviewViewer({ initial }: { initial: Review }) {
  const [review, setReview] = useState<Review>(initial);
  const [letterStream, setLetterStream] = useState<string>("");
  const [stageStart, setStageStart] = useState<Record<string, number>>({});
  const [progressByPass, setProgressByPass] = useState<Record<number, ProgressEvent>>({});
  const [eventCount, setEventCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const streamRef = useRef<EventSource | null>(null);

  // Heartbeat for elapsed timers.
  useEffect(() => {
    if (review.status === "complete" || review.status === "failed") return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [review.status]);

  // Track when each stage becomes active so we can show elapsed time.
  useEffect(() => {
    setStageStart((prev) => (prev[review.status] ? prev : { ...prev, [review.status]: Date.now() }));
  }, [review.status]);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(`/api/review/${initial.id}/events`);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setEventCount((c) => c + 1);
        setLastEventAt(Date.now());
        if (data.type === "review") {
          setReview(data.review as Review);
        } else if (data.type === "letter_chunk") {
          setLetterStream((prev) => prev + data.text);
        } else if (data.type === "progress") {
          setProgressByPass((prev) => ({
            ...prev,
            [data.pass]: { message: data.message, current: data.current, total: data.total, pass: data.pass },
          }));
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [initial.id, initial.status]);

  const stageIdx = STATUS_ORDER[review.status] ?? 0;
  const complete = review.status === "complete";
  const failed = review.status === "failed";
  const totalElapsedSec = Math.max(
    0,
    Math.floor((now - new Date(review.createdAt).getTime()) / 1000),
  );

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Review · {review.id.slice(0, 8)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {review.extraction?.particulars.propertyAddress ?? "(property address pending)"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {complete && (
            <>
              <a
                href={`/api/export/${review.id}/pdf`}
                className="inline-flex items-center rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Download PDF
              </a>
              <a
                href={`/api/export/${review.id}/docx`}
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Download DOCX
              </a>
            </>
          )}
        </div>
      </header>

      {!complete && !failed && (
        <Pipeline
          stageIdx={stageIdx}
          stageStart={stageStart}
          now={now}
          progressByPass={progressByPass}
          eventCount={eventCount}
          lastEventAt={lastEventAt}
          totalElapsedSec={totalElapsedSec}
        />
      )}

      {failed && review.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold mb-1">Pipeline failed</div>
          <div className="font-mono text-xs whitespace-pre-wrap">{review.error}</div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-8">
        <section className="lg:col-span-2 space-y-6">
          <Panel title="Particulars" pulse={stageIdx === 2}>
            <Particulars review={review} />
          </Panel>
          <Panel title={`Compliance findings (${review.compliance.length})`} pulse={stageIdx === 3}>
            <ComplianceList items={review.compliance} activePass={!complete && !failed && stageIdx === 3} />
          </Panel>
          <Panel title={`Risk findings (${review.risks.length})`} pulse={stageIdx === 4}>
            <RiskList items={review.risks} activePass={!complete && !failed && stageIdx === 4} />
          </Panel>
        </section>

        <section className="lg:col-span-3">
          <Panel title="Letter of advice" pulse={stageIdx === 5}>
            <LetterView review={review} stream={letterStream} />
          </Panel>
        </section>
      </div>
    </div>
  );
}

// ---------- Pipeline progress UI ----------

function Pipeline(props: {
  stageIdx: number;
  stageStart: Record<string, number>;
  now: number;
  progressByPass: Record<number, ProgressEvent>;
  eventCount: number;
  lastEventAt: number;
  totalElapsedSec: number;
}) {
  const { stageIdx, stageStart, now, progressByPass, eventCount, lastEventAt, totalElapsedSec } = props;
  const sinceLast = Math.max(0, Math.floor((now - lastEventAt) / 1000));
  const live = now - lastEventAt < 2000;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
            Pipeline
          </h2>
          <span className="text-xs text-zinc-400">·</span>
          <span className="text-xs text-zinc-500">{fmtMs(totalElapsedSec * 1000)} elapsed</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
            {live ? "live" : `quiet ${sinceLast}s`}
          </span>
          <span>·</span>
          <span className="tabular-nums">{eventCount} event{eventCount === 1 ? "" : "s"}</span>
        </div>
      </div>
      <ol className="divide-y divide-zinc-100">
        {STAGES.map((s, i) => {
          const passNum = i + 1;
          const state =
            stageIdx > passNum ? "done"
            : stageIdx === passNum ? "active"
            : "pending";
          const start = stageStart[s.status];
          const elapsed = state === "active" && start ? now - start : undefined;
          const progress = progressByPass[passNum];
          return (
            <li key={s.status} className="flex gap-4 px-5 py-3.5">
              <StageIcon state={state} number={passNum} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-medium ${state === "pending" ? "text-zinc-400" : "text-zinc-900"}`}>
                      {s.label}
                    </span>
                    <span className="text-xs text-zinc-400">{s.model}</span>
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {state === "active" && elapsed !== undefined ? fmtMs(elapsed) : state === "pending" ? s.typical : state === "done" ? "done" : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">{s.sub}</div>
                {state === "active" && progress && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-900">
                    <span className="h-1 w-1 rounded-full bg-zinc-900 animate-pulse" />
                    <span className="truncate">{progress.message}</span>
                    {progress.total ? (
                      <span className="ml-auto flex items-center gap-1.5 shrink-0">
                        <span className="h-1.5 w-24 rounded-full bg-zinc-100 overflow-hidden">
                          <span
                            className="block h-full bg-zinc-900 transition-[width]"
                            style={{ width: `${Math.round(((progress.current ?? 0) / progress.total) * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums text-zinc-500">{progress.current}/{progress.total}</span>
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

function StageIcon({ state, number }: { state: "done" | "active" | "pending"; number: number }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center">
        <svg className="h-5 w-5 animate-spin text-zinc-900" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 tabular-nums">
      {number}
    </span>
  );
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs.toString().padStart(2, "0")}s`;
}

// ---------- Panels ----------

function Panel({ title, children, pulse }: { title: string; children: React.ReactNode; pulse?: boolean }) {
  return (
    <section className={`rounded-xl border bg-white transition-shadow ${pulse ? "border-zinc-300 shadow-[0_0_0_3px_rgba(0,0,0,0.03)]" : "border-zinc-200"}`}>
      <header className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3">
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 animate-pulse" />}
        <h2 className="text-sm font-semibold tracking-widest uppercase text-zinc-500">
          {title}
        </h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Particulars({ review }: { review: Review }) {
  const p = review.extraction?.particulars;
  if (!p) return <Waiting>extraction pending</Waiting>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-zinc-500">Property</dt>
      <dd className="text-zinc-900">{p.propertyAddress}</dd>
      <dt className="text-zinc-500">Price</dt>
      <dd className="text-zinc-900">{p.price.raw}</dd>
      <dt className="text-zinc-500">Deposit</dt>
      <dd className="text-zinc-900">{p.deposit.raw}</dd>
      <dt className="text-zinc-500">Settlement</dt>
      <dd className="text-zinc-900">{p.settlementDate}</dd>
      {p.parties.map((party, i) => (
        <div key={i} className="col-span-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-zinc-500 capitalize">{party.role.replace("_", " ")}</dt>
          <dd className="text-zinc-900">{party.name}</dd>
        </div>
      ))}
    </dl>
  );
}

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-900 border-red-200",
  high: "bg-orange-100 text-orange-900 border-orange-200",
  medium: "bg-amber-100 text-amber-900 border-amber-200",
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
  info: "bg-sky-100 text-sky-900 border-sky-200",
};
const STATUS_BADGE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-900 border-emerald-200",
  fail: "bg-red-100 text-red-900 border-red-200",
  warning: "bg-amber-100 text-amber-900 border-amber-200",
  needs_review: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

function ComplianceList({ items, activePass }: { items: ComplianceFinding[]; activePass: boolean }) {
  if (items.length === 0) {
    return (
      <Waiting>
        {activePass ? "running compliance checks…" : "compliance checks pending"}
      </Waiting>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.ruleId} className="border border-zinc-100 rounded-md p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium text-zinc-900">{c.title}</div>
            <div className="flex gap-1 shrink-0">
              <span className={`text-xs rounded border px-1.5 py-0.5 ${STATUS_BADGE[c.status]}`}>
                {c.status}
              </span>
              <span className={`text-xs rounded border px-1.5 py-0.5 ${SEV_BADGE[c.severity]}`}>
                {c.severity}
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-zinc-600 leading-relaxed">{c.explanation}</p>
          {c.citations.length > 0 && (
            <div className="mt-2 text-xs text-zinc-500">
              {c.citations.map((cit, i) => (
                <span key={i} className="mr-2">
                  <em>{cit.act}</em> s {cit.section}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function RiskList({ items, activePass }: { items: RiskFinding[]; activePass: boolean }) {
  if (items.length === 0) {
    return (
      <Waiting>
        {activePass ? "analysing risk with Claude Opus 4.6…" : "risk analysis pending"}
      </Waiting>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="border border-zinc-100 rounded-md p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium text-zinc-900">{r.title}</div>
            <span className={`text-xs rounded border px-1.5 py-0.5 ${SEV_BADGE[r.severity]}`}>
              {r.severity}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-zinc-600 leading-relaxed">{r.explanation}</p>
          {r.netEffect && (
            <p className="mt-1.5 text-xs text-zinc-900">
              <span className="font-medium">Net effect:</span> {r.netEffect}
            </p>
          )}
          {(r.specialConditionNumber || r.generalConditionNumber) && (
            <div className="mt-1.5 text-xs text-zinc-500">
              {r.specialConditionNumber && <>SC {r.specialConditionNumber}</>}
              {r.specialConditionNumber && r.generalConditionNumber && " · "}
              {r.generalConditionNumber && <>GC {r.generalConditionNumber}</>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function LetterView({ review, stream }: { review: Review; stream: string }) {
  const letter = review.letter;
  const fullMarkdown = useMemo(() => {
    if (letter) {
      return letter.sections.map((s) => `## ${s.heading}\n\n${s.markdown}`).join("\n\n");
    }
    return stream;
  }, [letter, stream]);

  if (!letter && !stream) {
    return <Waiting>letter composition pending</Waiting>;
  }

  return (
    <article className="prose prose-zinc max-w-none text-sm leading-relaxed">
      <MarkdownRender text={fullMarkdown} />
      {!letter && stream && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 italic">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 animate-pulse" />
          streaming from Claude Opus 4.6…
        </div>
      )}
    </article>
  );
}

/** Tiny markdown renderer — handles h2, h3, bullets, numbered lists, **bold**, and paragraphs. */
function MarkdownRender({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      out.push(
        <h2 key={key++} className="mt-6 mb-2 text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-1">
          {renderInline(h2[1])}
        </h2>,
      );
      i++;
      continue;
    }
    if (h3) {
      out.push(
        <h3 key={key++} className="mt-4 mb-1.5 text-sm font-semibold text-zinc-900">
          {renderInline(h3[1])}
        </h3>,
      );
      i++;
      continue;
    }
    const bullet = line.match(/^(?:\s*)[-*]\s+/);
    if (bullet) {
      const items: string[] = [];
      while (i < lines.length && /^(?:\s*)[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(?:\s*)[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 list-disc pl-5 space-y-1">
          {items.map((t, j) => (
            <li key={j}>{renderInline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const numbered = line.match(/^(?:\s*)\d+\.\s+/);
    if (numbered) {
      const items: string[] = [];
      while (i < lines.length && /^(?:\s*)\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(?:\s*)\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="my-2 list-decimal pl-5 space-y-1">
          {items.map((t, j) => (
            <li key={j}>{renderInline(t)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    // Paragraph
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^##?#?\s+/.test(lines[i]) &&
      !/^(?:\s*)[-*]\s+/.test(lines[i]) &&
      !/^(?:\s*)\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="my-2 text-zinc-700">
        {renderInline(paraLines.join(" "))}
      </p>,
    );
  }
  return <>{out}</>;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const rx = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      nodes.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key++}>{t.slice(1, -1)}</em>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-zinc-400 italic py-2">{children}</div>
  );
}
