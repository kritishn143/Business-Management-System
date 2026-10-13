"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCheck, CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { discardQueued } from "./sale-repository";
import { useSync } from "@/lib/offline/sync-provider";
import type { QueuedMutation } from "@/lib/offline/policy";
import { formatMoney, type FormatContext } from "@/lib/format";

/** Just enough of the queued command to describe it back to the cashier. */
type QueuedSale = {
  lines?: { quantity: number; unitPrice: number; lineDiscount: number }[];
  discount?: number;
  method?: string;
  customerId?: string | null;
};

function describe(entry: QueuedMutation): { items: number; total: number; method: string } {
  const payload = (entry.payload ?? {}) as QueuedSale;
  const lines = payload.lines ?? [];

  const gross = lines.reduce(
    (t, l) => t + l.quantity * l.unitPrice - (l.lineDiscount ?? 0),
    0,
  );

  return {
    items: lines.length,
    total: Math.max(0, gross - (payload.discount ?? 0)),
    method: payload.method ?? "cash",
  };
}

export function PendingSales({ ctx }: { ctx: FormatContext }) {
  const sync = useSync();
  const [discarding, setDiscarding] = React.useState<string | null>(null);

  if (!sync) return null;

  const { entries, online, syncing, summary } = sync;

  async function drop(entry: QueuedMutation) {
    setDiscarding(entry.id);
    await discardQueued(entry.id);
    setDiscarding(null);
    sync?.refresh();
    toast.success("Removed from this device.");
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="Everything is synced"
        description="Sales recorded on this device have all reached the server. Anything taken while offline will appear here until it syncs."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised px-5 py-4">
        <p className="text-sm text-ink">
          {online ? (
            <>
              {summary.pending > 0
                ? `${summary.pending} waiting to reach the server`
                : "Nothing waiting"}
              {summary.rejected > 0 ? (
                <span className="text-critical">
                  {" · "}
                  {summary.rejected} refused
                </span>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <CloudOff className="size-4" aria-hidden />
              You&rsquo;re offline — these will sync when you reconnect.
            </span>
          )}
        </p>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={sync.sync}
          disabled={syncing || !online}
        >
          <RefreshCw className={syncing ? "animate-spin" : undefined} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <ul className="space-y-3">
        {entries.map((entry) => {
          const { items, total, method } = describe(entry);
          const refused = entry.status === "rejected";

          return (
            <li
              key={entry.id}
              className={
                "rounded-xl border bg-surface-raised px-5 py-4 " +
                (refused ? "border-critical/40" : "border-line")
              }
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  {refused ? (
                    <Badge tone="critical">Refused</Badge>
                  ) : entry.status === "syncing" ? (
                    <Badge tone="neutral">Sending</Badge>
                  ) : (
                    <Badge tone="caution">Waiting</Badge>
                  )}
                  <span className="tabular text-sm font-medium text-ink">
                    {formatMoney(total.toFixed(2), ctx)}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {items} {items === 1 ? "item" : "items"} · {method}
                  </span>
                </div>

                <span className="text-[13px] text-ink-subtle">
                  taken {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              {refused ? (
                <p className="mt-2 flex gap-2 text-[13px] text-critical">
                  <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
                  <span>
                    {entry.lastError ?? "The server refused this sale."} It has not been
                    recorded. Re-enter it at the counter if it should be, then remove it
                    from here.
                  </span>
                </p>
              ) : entry.lastError ? (
                <p className="mt-2 text-[13px] text-ink-subtle">
                  Last attempt: {entry.lastError} · {entry.attempts}{" "}
                  {entry.attempts === 1 ? "try" : "tries"} so far
                </p>
              ) : null}

              {refused ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => drop(entry)}
                    disabled={discarding === entry.id}
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-[13px] text-ink-subtle">
        Each queued sale carries a key the server recognises, so syncing one twice
        cannot record it twice.
      </p>
    </div>
  );
}
