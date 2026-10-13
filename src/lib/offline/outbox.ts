import { getAll, isOfflineCapable, put, remove, OUTBOX } from "./db";
import type { QueuedMutation, QueuedStatus } from "./policy";

/**
 * The mutation queue. Every write goes through here so an operation survives a
 * refresh, a closed tab or a flat battery (SPEC §50).
 */

export async function enqueue<T>(entry: {
  id: string;
  kind: "sale";
  payload: T;
  actorId: string | null;
}): Promise<void> {
  if (!isOfflineCapable()) throw new Error("This browser cannot store work offline.");

  const record: QueuedMutation<T> = {
    ...entry,
    status: "pending",
    attempts: 0,
    // Times come from the device, and are used only for ordering and backoff —
    // never as the transaction date, which the server stamps.
    createdAt: Date.now(),
    lastAttemptAt: null,
    lastError: null,
  };

  // put() by primary key, so re-enqueuing the same attempt overwrites rather
  // than duplicating it.
  await put(OUTBOX, record);
}

export async function listQueue(): Promise<QueuedMutation[]> {
  if (!isOfflineCapable()) return [];
  try {
    return await getAll<QueuedMutation>(OUTBOX);
  } catch {
    // A blocked or corrupt store must not take the app down with it.
    return [];
  }
}

export async function markStatus(
  entry: QueuedMutation,
  status: QueuedStatus,
  patch: { attempts?: number; lastError?: string | null } = {},
): Promise<void> {
  await put(OUTBOX, {
    ...entry,
    status,
    attempts: patch.attempts ?? entry.attempts,
    lastError: patch.lastError ?? entry.lastError,
    lastAttemptAt: Date.now(),
  });
}

export async function discard(id: string): Promise<void> {
  await remove(OUTBOX, id);
}
