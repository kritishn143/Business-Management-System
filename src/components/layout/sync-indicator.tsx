"use client";

import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSync } from "@/lib/offline/sync-provider";

/**
 * Says what the shop needs to know and nothing more: whether work is waiting to
 * reach the server, and whether anything needs a person (SPEC §72).
 *
 * Silent when everything is synced — a permanent green badge teaches people to
 * stop looking at it.
 */
export function SyncIndicator() {
  const sync = useSync();
  if (!sync) return null;

  const { online, summary, syncing } = sync;

  if (summary.rejected > 0) {
    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="text-critical hover:bg-critical-wash hover:text-critical"
      >
        <Link href="/sales/pending">
          <TriangleAlert />
          {summary.rejected} sale{summary.rejected === 1 ? "" : "s"} need you
        </Link>
      </Button>
    );
  }

  if (summary.pending > 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={sync.sync}
        disabled={syncing}
        className="text-caution hover:bg-caution-wash hover:text-caution"
        title={
          online
            ? "Waiting to reach the server. Click to try now."
            : "Saved on this device. They will sync when you are back online."
        }
      >
        <RefreshCw className={syncing ? "animate-spin" : undefined} />
        {summary.pending} waiting
      </Button>
    );
  }

  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted"
        title="You can keep selling. Sales are saved on this device and sync when you reconnect."
      >
        <CloudOff className="size-4" aria-hidden />
        Offline
      </span>
    );
  }

  return null;
}
