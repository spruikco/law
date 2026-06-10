import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot } from "../paths";
import { createReviewStore } from "./create-review-store";

interface TestReview {
  id: string;
  createdAt: string;
  status: "pending" | "running" | "complete" | "failed";
  note?: string;
}
type TestProgress = { type: "progress"; message: string };

const STORE_NAME = `test-reviews-${process.pid}`;
const store = createReviewStore<TestReview, TestProgress>(STORE_NAME);

const newReview = () =>
  store.create((base) => ({ ...base, status: "pending" as const }));

afterAll(async () => {
  await rm(path.join(repoRoot(), ".cache", STORE_NAME), {
    recursive: true,
    force: true,
  });
});

describe("createReviewStore", () => {
  it("creates and reads back a review", async () => {
    const review = await newReview();
    expect(review.id).toMatch(/[0-9a-f-]{36}/);
    const loaded = await store.get(review.id);
    expect(loaded).toEqual(review);
  });

  it("returns null for unknown ids", async () => {
    expect(await store.get("does-not-exist")).toBeNull();
  });

  it("updates in place and emits a review event to subscribers", async () => {
    const review = await newReview();
    const events: unknown[] = [];
    const unsubscribe = store.subscribe(review.id, (evt) => events.push(evt.event));

    const updated = await store.update(review.id, { note: "hello" });
    expect(updated.note).toBe("hello");
    expect((await store.get(review.id))?.note).toBe("hello");
    expect(events).toEqual([{ type: "review", review: updated }]);

    unsubscribe();
    await store.setStatus(review.id, "complete");
    expect(events).toHaveLength(1); // no events after unsubscribe
    expect((await store.get(review.id))?.status).toBe("complete");
  });

  it("throws when updating a missing review", async () => {
    await expect(store.update("missing", {})).rejects.toThrow(/not found/);
  });

  it("holds uploads until released", async () => {
    const uploads = [{ filename: "a.pdf", bytes: Buffer.from("pdf") }];
    const review = await store.create(
      (base) => ({ ...base, status: "pending" as const }),
      uploads,
    );
    expect(store.getUploads(review.id)).toEqual(uploads);
    store.releaseUploads(review.id);
    expect(store.getUploads(review.id)).toBeUndefined();
  });

  it("fans out emitted progress events to every subscriber", async () => {
    const review = await newReview();
    const a: unknown[] = [];
    const b: unknown[] = [];
    store.subscribe(review.id, (evt) => a.push(evt.event));
    store.subscribe(review.id, (evt) => b.push(evt.event));
    store.emit(review.id, { type: "progress", message: "working" });
    expect(a).toEqual([{ type: "progress", message: "working" }]);
    expect(b).toEqual(a);
  });
});
