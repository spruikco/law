import {
  getBillingReview,
  subscribeBilling,
  type BillingProgressEnvelope,
} from "@/lib/store/billing-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const initial = await getBillingReview(id);
  if (!initial) return new Response("not found", { status: 404 });

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

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      send({
        type: "review",
        review: initial,
      } satisfies BillingProgressEnvelope["event"]);

      if (initial.status === "complete" || initial.status === "failed") {
        cleanup();
        return;
      }

      unsubscribe = subscribeBilling(id, (envelope) => {
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
      // handled by closed guard
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
