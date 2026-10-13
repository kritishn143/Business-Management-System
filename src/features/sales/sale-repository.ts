"use client";

import { completeSaleAction, type CompleteSaleResult } from "./actions";
import { classifyOutcome, dueEntries, type QueuedMutation } from "@/lib/offline/policy";
import { discard, enqueue, listQueue, markStatus } from "@/lib/offline/outbox";
import { isOfflineCapable } from "@/lib/offline/db";

/**
 * The repository boundary SPEC §50 and §83 ask for: the POS says "record this
 * sale" and does not know or care whether that happened on the server or in a
 * queue on this device. The same boundary is what a Flutter client would
 * reimplement against the same RPC.
 */

export type SaleCommand = Parameters<typeof completeSaleAction>[0];

/** Who is at the till. Captured server-side and passed in, never guessed. */
export type Actor = string | null;

export type SubmitResult =
  | { state: "completed"; saleId: string; invoiceNumber: string }
  | { state: "queued" }
  | { state: "refused"; error: string };

/** A sale command carries its own idempotency key. */
function keyOf(command: SaleCommand): string {
  const id = (command as { clientTransactionId?: unknown })?.clientTransactionId;
  return typeof id === "string" ? id : "";
}

async function callServer(
  command: SaleCommand,
): Promise<{ result: CompleteSaleResult } | { thrown: unknown }> {
  try {
    return { result: await completeSaleAction(command) };
  } catch (thrown) {
    return { thrown };
  }
}

/**
 * Records a sale. If the request cannot reach the server it is queued and
 * reported as queued — never as completed, and never silently lost.
 */
export async function submitSale(
  command: SaleCommand,
  actorId: Actor = null,
): Promise<SubmitResult> {
  const key = keyOf(command);

  // Offline already? Don't make the cashier wait for a request that cannot work.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (!key || !isOfflineCapable()) {
      return {
        state: "refused",
        error: "You're offline and this browser can't hold the sale. Reconnect and try again.",
      };
    }
    await enqueue({ id: key, kind: "sale", payload: command, actorId });
    return { state: "queued" };
  }

  const attempt = await callServer(command);
  const outcome = classifyOutcome(
    "thrown" in attempt ? { thrown: attempt.thrown } : attempt.result,
  );

  if (outcome.kind === "synced" && "result" in attempt && attempt.result.ok) {
    return {
      state: "completed",
      saleId: attempt.result.saleId,
      invoiceNumber: attempt.result.invoiceNumber,
    };
  }

  if (outcome.kind !== "retry") {
    // Either refused outright, or reported ok without a sale — neither is a
    // case for queueing.
    const error =
      outcome.kind === "rejected" ? outcome.error : "We couldn't complete that sale.";
    return { state: "refused", error };
  }

  // The network failed mid-flight. The sale may or may not have landed, which
  // is exactly what the idempotency key is for: syncing it again is safe.
  if (!key || !isOfflineCapable()) {
    return { state: "refused", error: outcome.error };
  }

  await enqueue({ id: key, kind: "sale", payload: command, actorId });
  return { state: "queued" };
}

export type SyncReport = { synced: number; retried: number; rejected: number };

/**
 * Drains the queue. Entries are sent one at a time, oldest first, so the shop's
 * sales reach the server in the order they happened and a single failure does
 * not reorder the rest.
 */
export async function syncOutbox(
  actorId: Actor = null,
  now = Date.now(),
): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, retried: 0, rejected: 0 };

  if (typeof navigator !== "undefined" && navigator.onLine === false) return report;

  const queue = await listQueue();
  // Only this person's queued sales: the server files a sale under whoever is
  // signed in now, so someone else's work must wait for them.
  const due = dueEntries(queue, now, actorId);

  for (const entry of due) {
    if (entry.kind !== "sale") continue;

    await markStatus(entry, "syncing");
    const attempt = await callServer(entry.payload as SaleCommand);
    const outcome = classifyOutcome(
      "thrown" in attempt ? { thrown: attempt.thrown } : attempt.result,
    );

    if (outcome.kind === "synced") {
      // The server has it; the local copy has done its job.
      await discard(entry.id);
      report.synced += 1;
      continue;
    }

    if (outcome.kind === "rejected") {
      await markStatus(entry, "rejected", { lastError: outcome.error });
      report.rejected += 1;
      continue;
    }

    await markStatus(entry, "pending", {
      attempts: entry.attempts + 1,
      lastError: outcome.error,
    });
    report.retried += 1;
    // Still offline: stop rather than hammering every entry in turn.
    break;
  }

  return report;
}

export async function queuedSales(): Promise<QueuedMutation[]> {
  return listQueue();
}

export { discard as discardQueued };
