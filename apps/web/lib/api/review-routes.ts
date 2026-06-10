import { NextResponse, type NextRequest } from "next/server";
import type { ProgressEnvelope, Upload } from "../store/create-review-store";

/**
 * Route-handler factories shared by every review module. Each module's
 * api directory wires these to its store + pipeline runner:
 *
 *   POST /api/{module}          uploadReviewPOST | jsonReviewPOST
 *   GET  /api/{module}/[id]     reviewGET
 *   GET  /api/{module}/[id]/events  reviewEventsGET (SSE)
 */

interface ReviewLike {
  id: string;
  status: string;
}

/** Read a trimmed string field from multipart form data, with fallback. */
export function formString(form: FormData, name: string, fallback: string): string {
  const v = form.get(name);
  return (typeof v === "string" ? v.trim() : "") || fallback;
}

/** Read an enum-constrained field from multipart form data, with fallback. */
export function formEnum<T extends string>(
  form: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = form.get(name);
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

type RouteContext = { params: Promise<{ id: string }> };

const TERMINAL_STATUSES = new Set(["complete", "failed"]);

/**
 * POST handler for upload-based modules.
 *   multipart/form-data: files: PDF[] plus module-specific string fields.
 * Returns { id }. The pipeline runs asynchronously; clients subscribe to
 * the module's /events route for progress.
 */
export function uploadReviewPOST<TReview extends ReviewLike, TFields>(opts: {
  create: (uploads: Upload[]) => Promise<TReview>;
  start: (id: string, fields: TFields) => void;
  parseFields: (form: FormData) => TFields;
}) {
  return async function POST(req: NextRequest) {
    const form = await req.formData();
    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
    }
    const uploads = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        bytes: Buffer.from(await f.arrayBuffer()),
      })),
    );
    const review = await opts.create(uploads);
    opts.start(review.id, opts.parseFields(form));
    return NextResponse.json({ id: review.id });
  };
}

/**
 * POST handler for intake-based modules: JSON body validated by a zod schema.
 */
export function jsonReviewPOST<TReview extends ReviewLike, TInput>(opts: {
  schema: {
    safeParse(value: unknown):
      | { success: true; data: TInput }
      | { success: false; error: { format(): unknown } };
  };
  create: (input: TInput) => Promise<TReview>;
  start: (id: string) => void;
}) {
  return async function POST(req: NextRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
    }
    const review = await opts.create(parsed.data);
    opts.start(review.id);
    return NextResponse.json({ id: review.id });
  };
}

/** GET /api/{module}/[id] — fetch the full review record. */
export function reviewGET<TReview extends ReviewLike>(
  get: (id: string) => Promise<TReview | null>,
) {
  return async function GET(_req: Request, { params }: RouteContext) {
    const { id } = await params;
    const review = await get(id);
    if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(review);
  };
}

/**
 * GET /api/{module}/[id]/events — Server-Sent Events stream of pipeline
 * progress. Emits an initial "review" event with current state, then
 * progress events as the pipeline runs; closes on complete/failed/error.
 */
export function reviewEventsGET<TReview extends ReviewLike, TProgress>(opts: {
  get: (id: string) => Promise<TReview | null>;
  subscribe: (
    id: string,
    listener: (evt: ProgressEnvelope<TReview, TProgress>) => void,
  ) => () => void;
}) {
  return async function GET(_req: Request, { params }: RouteContext) {
    const { id } = await params;
    const initial = await opts.get(id);
    if (!initial) {
      return new Response("not found", { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        // Held in an object: cleanup() can run (via send) before these are
        // assigned, so they can't be plain consts.
        const live: {
          unsubscribe?: () => void;
          keepAlive?: ReturnType<typeof setInterval>;
        } = {};

        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (live.keepAlive) clearInterval(live.keepAlive);
          if (live.unsubscribe) live.unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        /**
         * Safely enqueue a chunk. Swallow ERR_INVALID_STATE when the client
         * has already disconnected — otherwise the throw propagates up
         * through the pipeline runner's emit() fan-out and aborts the whole
         * pipeline.
         */
        const send = (data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            cleanup();
          }
        };

        // Initial state
        send({ type: "review", review: initial });

        if (TERMINAL_STATUSES.has(initial.status)) {
          cleanup();
          return;
        }

        live.unsubscribe = opts.subscribe(id, (envelope) => {
          send(envelope.event);
          const evt = envelope.event as { type?: string; review?: TReview };
          if (
            evt.type === "review" &&
            evt.review &&
            TERMINAL_STATUSES.has(evt.review.status)
          ) {
            cleanup();
          }
          if (evt.type === "error") cleanup();
        });

        // Keep-alive ping every 25s so proxies don't close the connection
        live.keepAlive = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            cleanup();
          }
        }, 25_000);
      },
      cancel() {
        // Client disconnect — Next.js calls this when the reader goes away.
        // No action needed here; the `closed` flag + `send()` guard handle it.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  };
}
