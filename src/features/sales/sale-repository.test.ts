/**
 * The sync loop end to end: a real IndexedDB queue, a stubbed server, and the
 * network turned on and off underneath it.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const completeSaleAction = vi.fn();
vi.mock("./actions", () => ({ completeSaleAction: (input: unknown) => completeSaleAction(input) }));

const { clear, put, OUTBOX } = await import("@/lib/offline/db");
const { listQueue } = await import("@/lib/offline/outbox");
const { submitSale, syncOutbox } = await import("./sale-repository");

/** Stands in for navigator.onLine, which vitest's node env does not provide. */
function setOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}

const command = (id: string) =>
  ({
    lines: [{ productId: "p1", unitId: "u1", quantity: 1, unitPrice: 20, lineDiscount: 0 }],
    customerId: null,
    discount: 0,
    additionalCharge: 0,
    roundOff: 0,
    method: "cash",
    paid: 20,
    notes: null,
    clientTransactionId: id,
  }) as unknown as Parameters<typeof submitSale>[0];

beforeEach(async () => {
  await clear(OUTBOX);
  completeSaleAction.mockReset();
  setOnline(true);
});

describe("submitSale", () => {
  it("completes straight through when the server answers", async () => {
    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s1", invoiceNumber: "SAL-1" });

    const result = await submitSale(command("t1"), "u1");

    expect(result).toEqual({ state: "completed", saleId: "s1", invoiceNumber: "SAL-1" });
    expect(await listQueue()).toEqual([]);
  });

  it("queues without even trying when the device is offline", async () => {
    setOnline(false);

    const result = await submitSale(command("t1"), "u1");

    expect(result).toEqual({ state: "queued" });
    expect(completeSaleAction).not.toHaveBeenCalled();
    expect(await listQueue()).toHaveLength(1);
  });

  it("queues when the request fails mid-flight", async () => {
    completeSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await submitSale(command("t1"), "u1");

    expect(result).toEqual({ state: "queued" });
    const queue = await listQueue();
    expect(queue[0].id).toBe("t1");
  });

  it("does not queue a sale the server refused", async () => {
    completeSaleAction.mockResolvedValue({ ok: false, error: "No permission." });

    const result = await submitSale(command("t1"), "u1");

    // Queueing a refusal would retry it forever and hide it from the cashier.
    expect(result).toEqual({ state: "refused", error: "No permission." });
    expect(await listQueue()).toEqual([]);
  });
});

describe("syncOutbox", () => {
  it("does nothing while offline", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");

    const report = await syncOutbox("u1");

    expect(report).toEqual({ synced: 0, retried: 0, rejected: 0 });
    expect(await listQueue()).toHaveLength(1);
  });

  it("drains the queue when the connection returns", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");
    await submitSale(command("t2"), "u1");

    setOnline(true);
    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s", invoiceNumber: "SAL-1" });

    const report = await syncOutbox("u1");

    expect(report.synced).toBe(2);
    expect(await listQueue()).toEqual([]);
  });

  it("sends the oldest sale first, whatever order they were queued in", async () => {
    setOnline(false);
    await submitSale(command("second"), "u1");
    await submitSale(command("first"), "u1");

    // Backdate the one queued last, so the drain cannot pass on insertion
    // order alone. Fake timers are no use here: they deadlock IndexedDB.
    const queued = await listQueue();
    for (const entry of queued) {
      await put(OUTBOX, { ...entry, createdAt: entry.id === "first" ? 1_000 : 2_000 });
    }

    setOnline(true);
    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s", invoiceNumber: "SAL-1" });

    await syncOutbox("u1");

    const sent = completeSaleAction.mock.calls.map(
      (call) => (call[0] as { clientTransactionId: string }).clientTransactionId,
    );
    expect(sent).toEqual(["first", "second"]);
  });

  it("resends with the same key, so the server can recognise the retry", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");

    setOnline(true);
    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s", invoiceNumber: "SAL-1" });
    await syncOutbox("u1");

    expect(
      (completeSaleAction.mock.calls[0][0] as { clientTransactionId: string })
        .clientTransactionId,
    ).toBe("t1");
  });

  it("keeps a sale queued and counts the attempt when the network fails again", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");

    setOnline(true);
    completeSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));

    const report = await syncOutbox("u1");

    expect(report).toEqual({ synced: 0, retried: 1, rejected: 0 });
    const [entry] = await listQueue();
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(1);
    expect(entry.lastError).toBe("Failed to fetch");
  });

  it("marks a refusal as rejected and stops retrying it", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");

    setOnline(true);
    completeSaleAction.mockResolvedValue({ ok: false, error: "That unit is not available." });

    expect(await syncOutbox("u1")).toEqual({ synced: 0, retried: 0, rejected: 1 });

    const [entry] = await listQueue();
    expect(entry.status).toBe("rejected");
    expect(entry.lastError).toBe("That unit is not available.");

    // A second pass must not touch it again.
    completeSaleAction.mockClear();
    await syncOutbox("u1", Date.now() + 10_000_000);
    expect(completeSaleAction).not.toHaveBeenCalled();
  });

  it("leaves another cashier's queued sale alone", async () => {
    setOnline(false);
    await submitSale(command("theirs"), "someone-else");

    setOnline(true);
    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s", invoiceNumber: "SAL-1" });

    const report = await syncOutbox("me");

    expect(report.synced).toBe(0);
    expect(completeSaleAction).not.toHaveBeenCalled();
    expect(await listQueue()).toHaveLength(1);
  });

  it("waits out the backoff before trying a failed sale again", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");

    setOnline(true);
    completeSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));
    await syncOutbox("u1");

    completeSaleAction.mockClear();
    // One attempt in, the next is due two seconds later.
    await syncOutbox("u1", Date.now() + 500);
    expect(completeSaleAction).not.toHaveBeenCalled();

    completeSaleAction.mockResolvedValue({ ok: true, saleId: "s", invoiceNumber: "SAL-1" });
    await syncOutbox("u1", Date.now() + 5_000);
    expect(completeSaleAction).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toEqual([]);
  });

  it("stops after the first network failure rather than hammering the rest", async () => {
    setOnline(false);
    await submitSale(command("t1"), "u1");
    await submitSale(command("t2"), "u1");

    setOnline(true);
    completeSaleAction.mockRejectedValue(new TypeError("Failed to fetch"));

    await syncOutbox("u1");

    expect(completeSaleAction).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(2);
  });
});
