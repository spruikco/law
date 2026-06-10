import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  formEnum,
  formString,
  jsonReviewPOST,
  reviewGET,
  uploadReviewPOST,
} from "./review-routes";

const asNextRequest = (req: Request) => req as unknown as NextRequest;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("uploadReviewPOST", () => {
  const makeHandler = () => {
    const create = vi.fn(async () => ({ id: "r1", status: "pending" }));
    const start = vi.fn();
    const handler = uploadReviewPOST({
      create,
      start,
      parseFields: (form) => ({ clientName: formString(form, "clientName", "Client") }),
    });
    return { create, start, handler };
  };

  it("rejects a request with no files", async () => {
    const { handler, create } = makeHandler();
    const form = new FormData();
    form.set("clientName", "Jane");
    const res = await handler(
      asNextRequest(new Request("http://test/api/review", { method: "POST", body: form })),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the review, starts the pipeline, returns the id", async () => {
    const { handler, create, start } = makeHandler();
    const form = new FormData();
    form.set("clientName", "  Jane  ");
    form.append("files", new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" }));
    const res = await handler(
      asNextRequest(new Request("http://test/api/review", { method: "POST", body: form })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "r1" });
    expect(create).toHaveBeenCalledWith([
      { filename: "contract.pdf", bytes: expect.any(Buffer) },
    ]);
    expect(start).toHaveBeenCalledWith("r1", { clientName: "Jane" });
  });
});

describe("jsonReviewPOST", () => {
  const schema = z.object({ jurisdiction: z.literal("VIC"), amount: z.number() });
  const makeHandler = () => {
    const create = vi.fn(async () => ({ id: "b1", status: "pending" }));
    const start = vi.fn();
    return { create, start, handler: jsonReviewPOST({ schema, create, start }) };
  };

  it("rejects malformed JSON", async () => {
    const { handler } = makeHandler();
    const res = await handler(
      asNextRequest(
        new Request("http://test/api/billing", { method: "POST", body: "{nope" }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects schema violations with 422", async () => {
    const { handler, create } = makeHandler();
    const res = await handler(
      asNextRequest(
        new Request("http://test/api/billing", {
          method: "POST",
          body: JSON.stringify({ jurisdiction: "NSW", amount: "x" }),
        }),
      ),
    );
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates and starts on valid input", async () => {
    const { handler, create, start } = makeHandler();
    const res = await handler(
      asNextRequest(
        new Request("http://test/api/billing", {
          method: "POST",
          body: JSON.stringify({ jurisdiction: "VIC", amount: 42 }),
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "b1" });
    expect(create).toHaveBeenCalledWith({ jurisdiction: "VIC", amount: 42 });
    expect(start).toHaveBeenCalledWith("b1");
  });
});

describe("reviewGET", () => {
  it("404s for unknown reviews and returns known ones", async () => {
    const handler = reviewGET(async (id) =>
      id === "known" ? { id, status: "complete" } : null,
    );
    const missing = await handler(new Request("http://test"), ctx("nope"));
    expect(missing.status).toBe(404);
    const found = await handler(new Request("http://test"), ctx("known"));
    expect(await found.json()).toEqual({ id: "known", status: "complete" });
  });
});

describe("form field helpers", () => {
  it("formString trims and falls back", () => {
    const form = new FormData();
    form.set("a", "  x ");
    form.set("empty", "   ");
    expect(formString(form, "a", "d")).toBe("x");
    expect(formString(form, "empty", "d")).toBe("d");
    expect(formString(form, "missing", "d")).toBe("d");
  });

  it("formEnum only accepts allowed values", () => {
    const form = new FormData();
    form.set("role", "attorney");
    form.set("bad", "hacker");
    const allowed = ["principal", "attorney"] as const;
    expect(formEnum(form, "role", allowed, "principal")).toBe("attorney");
    expect(formEnum(form, "bad", allowed, "principal")).toBe("principal");
    expect(formEnum(form, "missing", allowed, "principal")).toBe("principal");
  });
});
