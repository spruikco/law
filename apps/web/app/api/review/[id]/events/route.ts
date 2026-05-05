import { getReview, subscribe, type ProgressEnvelope } from "@/lib/store/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Server-Sent Events stream of pipeline progress for a given review.
 * The stream emits:
 *   - an initial "review" event with the current full state
 *   - pipeline progress events as the pipeline runs
 *   - closes when status is complete or failed
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const initial = await getReview(id);
  if (!initial) {
    return new Response("not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let keepAlive: ReturnType<typeof setInterval> | undefined;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      /**
       * Safely enqueue a chunk. Swallow ERR_INVALID_STATE when the client has
       * already disconnected — otherwise the throw propagates up through the
       * pipeline runner's emit() fan-out and aborts the whole pipeline.
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
      send({ type: "review", review: initial } satisfies ProgressEnvelope["event"]);

      if (initial.status === "complete" || initial.status === "failed") {
        cleanup();
        return;
      }

      unsubscribe = subscribe(id, (envelope) => {
        send(envelope.event);
        if (
          envelope.event.type === "review" &&
          (envelope.event.review.status === "complete" ||
            envelope.event.review.status === "failed")
        ) {
          cleanup();
        }
        if (envelope.event.type === "error") cleanup();
      });

      // Keep-alive ping every 25s so proxies don't close the connection
      keepAlive = setInterval(() => {
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
}
