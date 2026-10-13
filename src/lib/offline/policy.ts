/**
 * What the sync engine decides, kept free of IndexedDB and fetch so it can be
 * tested directly (SPEC §50-52).
 */

export type QueuedStatus = "pending" | "syncing" | "rejected";

export type QueuedMutation<T = unknown> = {
  /** The idempotency key. Also the record's primary key, so a double enqueue
   *  of the same attempt cannot create two queue entries (SPEC §52). */
  id: string;
  kind: "sale";
  payload: T;
  /** Who took the sale. A till is shared, and the server records the *current*
   *  session as the author, so an entry must only sync for the person who
   *  created it (SPEC §40). */
  actorId: string | null;
  status: QueuedStatus;
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
  lastError: string | null;
};

/**
 * A failure is only worth retrying if it was the network that failed. A sale
 * the server actually refused — bad data, no permission — must never be
 * retried in a loop; it is surfaced to a person instead.
 */
export type Outcome =
  | { kind: "synced" }
  | { kind: "retry"; error: string }
  | { kind: "rejected"; error: string };

export function classifyOutcome(
  result: { ok: true } | { ok: false; error: string } | { thrown: unknown },
): Outcome {
  if ("thrown" in result) {
    // A thrown error from a server action means the request never completed:
    // offline, DNS, timeout, a 502 in front of the app. Worth retrying.
    return { kind: "retry", error: describeThrown(result.thrown) };
  }
  if (result.ok) return { kind: "synced" };

  // The server answered and said no. Retrying would only repeat the answer.
  return { kind: "rejected", error: result.error };
}

function describeThrown(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The connection failed.";
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/**
 * Exponential backoff, capped. Deterministic: with no clock and no randomness
 * here, a queue's behaviour can be reasoned about and tested.
 */
export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const delay = BASE_DELAY_MS * 2 ** (attempts - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

/**
 * Whether this entry is this signed-in person's to sync. An entry belonging to
 * someone else waits for them rather than being filed under the wrong name.
 */
export function belongsTo(entry: QueuedMutation, actorId: string | null): boolean {
  // An entry with no recorded actor predates this check; syncing it is better
  // than stranding it, and the server still authorises the request.
  if (entry.actorId === null) return true;
  return entry.actorId === actorId;
}

/** Whether an entry is due for another attempt at the given moment. */
export function isDue(entry: QueuedMutation, now: number): boolean {
  if (entry.status !== "pending") return false;
  if (entry.lastAttemptAt === null) return true;
  return now - entry.lastAttemptAt >= retryDelayMs(entry.attempts);
}

/** Oldest first: a shop's sales should reach the server in the order they happened. */
export function dueEntries(
  entries: QueuedMutation[],
  now: number,
  actorId: string | null = null,
): QueuedMutation[] {
  return entries
    .filter((e) => isDue(e, now) && belongsTo(e, actorId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export type QueueSummary = {
  pending: number;
  rejected: number;
  /** When the oldest pending entry was created, for "waiting since" wording. */
  oldestPendingAt: number | null;
};

export function summarise(entries: QueuedMutation[]): QueueSummary {
  const pending = entries.filter((e) => e.status !== "rejected");
  return {
    pending: pending.length,
    rejected: entries.filter((e) => e.status === "rejected").length,
    oldestPendingAt:
      pending.length === 0 ? null : Math.min(...pending.map((e) => e.createdAt)),
  };
}
