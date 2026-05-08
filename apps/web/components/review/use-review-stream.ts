"use client";

import { useEffect, useRef, useState } from "react";

export interface PipelineProgressEvent {
  message: string;
  current?: number;
  total?: number;
  pass: number;
}

export interface ReviewStreamState<R extends { id: string; status: string; createdAt: string }> {
  review: R;
  letterStream: string;
  stageStart: Record<string, number>;
  progressByPass: Record<number, PipelineProgressEvent>;
  eventCount: number;
  lastEventAt: number;
  now: number;
  totalElapsedSec: number;
}

/**
 * Subscribe to the SSE event stream for a review and accumulate state.
 * Pass the SSE endpoint (e.g. `/api/review/${id}/events`) and the initial
 * review record. Terminal states (`complete` / `failed`) skip the stream.
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
    const es = new EventSource(eventsEndpoint);
    streamRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setEventCount((c) => c + 1);
        setLastEventAt(Date.now());
        if (data.type === "review") {
          setReview(data.review as R);
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
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
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
  };
}

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}
