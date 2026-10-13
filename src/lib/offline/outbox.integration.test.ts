/**
 * Exercises the real IndexedDB code paths against an in-memory implementation,
 * so the queue is tested rather than only the logic around it.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clear, OUTBOX, CACHE } from "./db";
import { discard, enqueue, listQueue, markStatus } from "./outbox";
import { loadCatalogue, saveCatalogue, type CachedProduct } from "./catalogue";
import { dueEntries, summarise } from "./policy";

beforeEach(async () => {
  await clear(OUTBOX);
  await clear(CACHE);
});

describe("the outbox", () => {
  it("starts empty", async () => {
    expect(await listQueue()).toEqual([]);
  });

  it("keeps a queued sale, with its payload intact", async () => {
    await enqueue({
      id: "txn-1",
      kind: "sale",
      payload: { lines: [{ productId: "p1", quantity: 2 }], method: "cash" },
      actorId: "u1",
    });

    const queue = await listQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: "txn-1",
      kind: "sale",
      status: "pending",
      attempts: 0,
      actorId: "u1",
      lastError: null,
    });
    expect(queue[0].payload).toEqual({
      lines: [{ productId: "p1", quantity: 2 }],
      method: "cash",
    });
  });

  it("does not duplicate an entry when the same attempt is queued twice", async () => {
    const entry = { id: "txn-1", kind: "sale" as const, payload: { a: 1 }, actorId: "u1" };
    await enqueue(entry);
    await enqueue(entry);

    // The idempotency key is the primary key, so a re-enqueue overwrites.
    expect(await listQueue()).toHaveLength(1);
  });

  it("keeps separate sales separate", async () => {
    await enqueue({ id: "txn-1", kind: "sale", payload: {}, actorId: "u1" });
    await enqueue({ id: "txn-2", kind: "sale", payload: {}, actorId: "u1" });
    expect((await listQueue()).map((e) => e.id).sort()).toEqual(["txn-1", "txn-2"]);
  });

  it("records a failed attempt without losing the work", async () => {
    await enqueue({ id: "txn-1", kind: "sale", payload: { a: 1 }, actorId: "u1" });
    const [entry] = await listQueue();

    await markStatus(entry, "pending", { attempts: 1, lastError: "Failed to fetch" });

    const [updated] = await listQueue();
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("Failed to fetch");
    expect(updated.status).toBe("pending");
    expect(updated.payload).toEqual({ a: 1 });
    expect(updated.lastAttemptAt).not.toBeNull();
  });

  it("marks a refusal so it is never retried", async () => {
    await enqueue({ id: "txn-1", kind: "sale", payload: {}, actorId: "u1" });
    const [entry] = await listQueue();
    await markStatus(entry, "rejected", { lastError: "No permission." });

    const queue = await listQueue();
    expect(queue[0].status).toBe("rejected");
    expect(dueEntries(queue, Date.now() + 1_000_000, "u1")).toEqual([]);
    expect(summarise(queue)).toMatchObject({ pending: 0, rejected: 1 });
  });

  it("forgets an entry once it has synced", async () => {
    await enqueue({ id: "txn-1", kind: "sale", payload: {}, actorId: "u1" });
    await discard("txn-1");
    expect(await listQueue()).toEqual([]);
  });

  it("survives being read back in a fresh transaction, as after a refresh", async () => {
    await enqueue({ id: "txn-1", kind: "sale", payload: { total: 250 }, actorId: "u1" });
    const first = await listQueue();
    const second = await listQueue();
    expect(second).toEqual(first);
  });
});

describe("the catalogue cache", () => {
  const products: CachedProduct[] = [
    {
      id: "p1",
      name: "Gel pen",
      sku: "GP-1",
      barcode: "8901",
      unitId: "u1",
      unitSymbol: "pc",
      sellingPrice: "60.00",
      stock: "40",
    },
  ];

  it("has nothing before anything is saved", async () => {
    expect(await loadCatalogue()).toBeNull();
  });

  it("saves and reads back the catalogue with a timestamp", async () => {
    await saveCatalogue(products);
    const snapshot = await loadCatalogue();

    expect(snapshot?.products).toEqual(products);
    expect(typeof snapshot?.savedAt).toBe("number");
  });

  it("replaces the previous snapshot rather than accumulating", async () => {
    await saveCatalogue(products);
    await saveCatalogue([{ ...products[0], id: "p2", name: "Ball pen" }]);

    const snapshot = await loadCatalogue();
    expect(snapshot?.products.map((p) => p.name)).toEqual(["Ball pen"]);
  });
});
