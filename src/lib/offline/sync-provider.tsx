"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { summarise, type QueueSummary, type QueuedMutation } from "./policy";
import { listQueue } from "./outbox";
import { syncOutbox } from "@/features/sales/sale-repository";

type SyncState = {
  online: boolean;
  summary: QueueSummary;
  entries: QueuedMutation[];
  syncing: boolean;
  /** Ask for a sync now — after recording a sale, or from the indicator. */
  sync: () => void;
  refresh: () => void;
};

const SyncContext = React.createContext<SyncState | null>(null);

/** Retried on an interval as well as on reconnect, because "online" lies. */
const POLL_MS = 30_000;

/**
 * Connectivity is browser state, not React state, so it is subscribed to
 * rather than copied into an effect. The server snapshot is "online", which is
 * what the markup hydrates against.
 */
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function SyncProvider({
  children,
  actorId = null,
}: {
  children: React.ReactNode;
  /** The signed-in user, so a shared till never files work under the wrong name. */
  actorId?: string | null;
}) {
  const router = useRouter();
  const online = React.useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [entries, setEntries] = React.useState<QueuedMutation[]>([]);
  const [syncing, setSyncing] = React.useState(false);

  // Kept in a ref so the polling effect never restarts and never overlaps.
  const running = React.useRef(false);

  const refresh = React.useCallback(() => {
    listQueue().then(setEntries).catch(() => setEntries([]));
  }, []);

  const sync = React.useCallback(() => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);

    syncOutbox(actorId)
      .then((report) => {
        if (report.synced > 0) {
          // Sales that just landed should show up in the lists behind this.
          router.refresh();
        }
      })
      .catch(() => {
        // A failed drain is not an error the cashier can act on; the queue
        // keeps the work and the next attempt will report it.
      })
      .finally(() => {
        running.current = false;
        setSyncing(false);
        refresh();
      });
  }, [actorId, refresh, router]);

  // Drain on mount, whenever the connection comes back, and on a slow timer —
  // because "online" only means a network, not a reachable server.
  React.useEffect(() => {
    refresh();
    if (online) sync();

    const timer = setInterval(() => {
      if (navigator.onLine) sync();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [online, refresh, sync]);

  const value = React.useMemo<SyncState>(
    () => ({
      online,
      summary: summarise(entries),
      entries,
      syncing,
      sync,
      refresh,
    }),
    [online, entries, syncing, sync, refresh],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Null outside the provider, so a component can be used anywhere. */
export function useSync(): SyncState | null {
  return React.useContext(SyncContext);
}
