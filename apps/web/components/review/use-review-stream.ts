"use client";

import { useEffect, useState } from "react";

export interface PipelineProgressEvent {
  message: string;
  current?: number;
  total?: number;
  pass: number;
}

export type StreamConnection = "connecting" | "open" | "reconnecting" | "closed";

export interface ReviewStreamState<R extends { id: string; status: string; createdAt: string }> {
  review: R;
  letterStream: string;
  stageStart: Record<string, number>;
  progressByPass: Record<number, PipelineProgressEvent>;
  eventCount: number;
  lastEventAt: number;
  now: number;
  totalElapsedSec: number;
  /** SSE connection state — "reconnecting" means events may be delayed. */
  connection: StreamConnection;
}

/**
 * Subscribe to the SSE event stream for a review and accumulate state.
 * Pass the SSE endpoint (e.g. `/api/review/${id}/events`) and the initial
 * review record. Terminal states (`complete` / `failed`) skip the stream.
 *
 * On network drops the browser's EventSource auto-reconnect kicks in and the
 * server replays the current review state on each new connection, so the UI
 * catches up by itself; we only close the stream once the review reaches a
 * terminal status (otherwise the reconnect loop would re-open it forever).
 */
export function useReviewStream<R extends { id: string; status: string; createdAt: string }>(
  initial: R,
  eventsEndpoint: string,
): ReviewStreamState<R> {
  const [review, setReview] = useState<R>(initial);
  const [letterStream, setLetterStream] = useState<string>("");
  const [stageStart, setStageStart] = useState<Record<string, number>>({});
  const [progressByPass, setProgressByPass] = useState<
    Record<number, PipelineProgressEvent>
  >({});
  const [eventCount, setEventCount] = useState(0);
  // Clock samples for the elapsed/quiet-time UI — intentionally impure
  // initial values; they only seed the display until the first tick/event.
  // eslint-disable-next-line react-hooks/purity
  const [lastEventAt, setLastEventAt] = useState<number>(Date.now());
  // eslint-disable-next-line react-hooks/purity
  const [now, setNow] = useState<number>(Date.now());
  const [connection, setConnection] = useState<StreamConnection>(
    initial.status === "complete" || initial.status === "failed" ? "closed" : "connecting",
  );

  useEffect(() => {
    if (review.status === "complete" || review.status === "failed") return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [review.status]);

  useEffect(() => {
    // Records when each pipeline stage was first observed; runs once per
    // status change and bails out when already recorded, so the extra render
    // pass is bounded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStageStart((prev) =>
      prev[review.status] ? prev : { ...prev, [review.status]: Date.now() },
    );
  }, [review.status]);

  useEffect(() => {
    if (initial.status === "complete" || initial.status === "failed") return;
    const es = new EventSource(eventsEndpoint);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      es.close();
      setConnection("closed");
    };
    es.onopen = () => {
      if (!closed) setConnection("open");
    };
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setEventCount((c) => c + 1);
        setLastEventAt(Date.now());
        if (data.type === "review") {
          const next = data.review as R;
          setReview(next);
          if (next.status === "complete" || next.status === "failed") close();
        } else if (data.type === "letter_chunk") {
          setLetterStream((prev) => prev + data.text);
        } else if (data.type === "progress") {
          setProgressByPass((prev) => ({
            ...prev,
            [data.pass]: {
              message: data.message,
              current: data.current,
              total: data.total,
              pass: data.pass,
            },
          }));
        } else if (data.type === "error") {
          close();
        }
      } catch {
        /* malformed event — skip it; the next review snapshot resyncs state */
      }
    };
    es.onerror = () => {
      // EventSource reconnects automatically; surface the gap to the UI.
      if (!closed) setConnection("reconnecting");
    };
    return close;
  }, [initial.id, initial.status, eventsEndpoint]);

  const totalElapsedSec = Math.max(
    0,
    Math.floor((now - new Date(review.createdAt).getTime()) / 1000),
  );

  return {
    review,
    letterStream,
    stageStart,
    progressByPass,
    eventCount,
    lastEventAt,
    now,
    totalElapsedSec,
    connection,
  };
}

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}
