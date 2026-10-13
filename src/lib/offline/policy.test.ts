import { describe, expect, it } from "vitest";
import {
  belongsTo,
  classifyOutcome,
  dueEntries,
  isDue,
  retryDelayMs,
  summarise,
  type QueuedMutation,
} from "./policy";

function entry(over: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: "t1",
    kind: "sale",
    payload: {},
    actorId: null,
    status: "pending",
    attempts: 0,
    createdAt: 1_000,
    lastAttemptAt: null,
    lastError: null,
    ...over,
  };
}

describe("classifyOutcome", () => {
  it("counts a successful call as synced", () => {
    expect(classifyOutcome({ ok: true })).toEqual({ kind: "synced" });
  });

  it("retries when the request never reached the server", () => {
    const outcome = classifyOutcome({ thrown: new TypeError("Failed to fetch") });
    expect(outcome).toEqual({ kind: "retry", error: "Failed to fetch" });
  });

  it("describes a thrown non-error without crashing", () => {
    expect(classifyOutcome({ thrown: "boom" })).toEqual({
      kind: "retry",
      error: "The connection failed.",
    });
  });

  it("does not retry something the server refused", () => {
    // Retrying a refusal would only repeat the refusal, forever.
    const outcome = classifyOutcome({
      ok: false,
      error: "You don't have permission to record sales.",
    });
    expect(outcome).toEqual({
      kind: "rejected",
      error: "You don't have permission to record sales.",
    });
  });
});

describe("retryDelayMs", () => {
  it("does not wait before the first attempt", () => {
    expect(retryDelayMs(0)).toBe(0);
  });

  it("backs off exponentially", () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(3)).toBe(8_000);
  });

  it("stops growing at five minutes", () => {
    expect(retryDelayMs(20)).toBe(300_000);
    expect(retryDelayMs(100)).toBe(300_000);
  });
});

describe("isDue", () => {
  it("a never-attempted entry is due immediately", () => {
    expect(isDue(entry(), 1_000)).toBe(true);
  });

  it("waits out the backoff after a failed attempt", () => {
    const e = entry({ attempts: 1, lastAttemptAt: 10_000 });
    expect(isDue(e, 11_000)).toBe(false);
    expect(isDue(e, 12_000)).toBe(true);
  });

  it("never retries a rejected entry, however long it waits", () => {
    const e = entry({ status: "rejected", attempts: 1, lastAttemptAt: 0 });
    expect(isDue(e, 10_000_000)).toBe(false);
  });

  it("skips an entry already in flight", () => {
    expect(isDue(entry({ status: "syncing" }), 999_999)).toBe(false);
  });
});

describe("dueEntries", () => {
  it("returns the oldest first, so sales reach the server in order", () => {
    const list = [
      entry({ id: "c", createdAt: 3_000 }),
      entry({ id: "a", createdAt: 1_000 }),
      entry({ id: "b", createdAt: 2_000 }),
    ];
    expect(dueEntries(list, 5_000).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out what is not due yet", () => {
    const list = [
      entry({ id: "ready", createdAt: 1_000 }),
      entry({ id: "waiting", createdAt: 2_000, attempts: 3, lastAttemptAt: 4_900 }),
    ];
    expect(dueEntries(list, 5_000).map((e) => e.id)).toEqual(["ready"]);
  });
});

describe("summarise", () => {
  it("reports an empty queue as nothing waiting", () => {
    expect(summarise([])).toEqual({ pending: 0, rejected: 0, oldestPendingAt: null });
  });

  it("counts what is waiting separately from what was refused", () => {
    const summary = summarise([
      entry({ id: "1", createdAt: 5_000 }),
      entry({ id: "2", status: "syncing", createdAt: 3_000 }),
      entry({ id: "3", status: "rejected", createdAt: 1_000 }),
    ]);
    expect(summary.pending).toBe(2);
    expect(summary.rejected).toBe(1);
    // A rejected entry is not "waiting", so it does not set the oldest.
    expect(summary.oldestPendingAt).toBe(3_000);
  });
});

describe("belongsTo", () => {
  it("is this person's entry when the actors match", () => {
    expect(belongsTo(entry({ actorId: "u1" }), "u1")).toBe(true);
  });

  it("is not theirs when someone else took the sale", () => {
    // The server files a sale under whoever is signed in now, so syncing
    // another cashier's queued sale would credit it to the wrong person.
    expect(belongsTo(entry({ actorId: "u1" }), "u2")).toBe(false);
    expect(belongsTo(entry({ actorId: "u1" }), null)).toBe(false);
  });

  it("syncs an entry with no recorded actor rather than stranding it", () => {
    expect(belongsTo(entry({ actorId: null }), "u1")).toBe(true);
    expect(belongsTo(entry({ actorId: null }), null)).toBe(true);
  });
});

describe("dueEntries with an actor", () => {
  it("leaves another cashier's work in the queue for them", () => {
    const list = [
      entry({ id: "mine", actorId: "u1", createdAt: 2_000 }),
      entry({ id: "theirs", actorId: "u2", createdAt: 1_000 }),
      entry({ id: "legacy", actorId: null, createdAt: 3_000 }),
    ];
    expect(dueEntries(list, 9_000, "u1").map((e) => e.id)).toEqual(["mine", "legacy"]);
  });

  it("without an actor, only unattributed entries are taken", () => {
    const list = [
      entry({ id: "mine", actorId: "u1" }),
      entry({ id: "legacy", actorId: null }),
    ];
    expect(dueEntries(list, 9_000).map((e) => e.id)).toEqual(["legacy"]);
  });
});
