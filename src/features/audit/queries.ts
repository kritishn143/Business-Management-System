import { createClient } from "@/lib/supabase/server";

export type AuditEvent = {
  id: string;
  action: "created" | "updated" | "deleted";
  entityType: string;
  entityId: string | null;
  actor: string;
  createdAt: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  /** Present when this event is something that can still be taken back. */
  undoable?: {
    movementId: string;
    undone: boolean;
    canUndo: boolean;
    isTransfer: boolean;
  };
};

/** How long an account entry stays changeable, matching the database. */
const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const AUDIT_PAGE_SIZE = 50;

/**
 * The shop's recent history, newest first. RLS limits this to owners,
 * managers and accountants; a cashier sees nothing (SPEC §40).
 */
export async function listAuditEvents({
  businessId,
  page = 1,
}: {
  businessId: string;
  page?: number;
}): Promise<{ events: AuditEvent[]; total: number; page: number }> {
  const supabase = await createClient();
  const from = (page - 1) * AUDIT_PAGE_SIZE;

  const { data, error, count } = await supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, user_id, created_at, old_data, new_data",
      { count: "exact" },
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  if (error) {
    console.error("[audit] list", error.code, error.message);
    throw new Error("We couldn't load your activity history.");
  }

  const rows = data ?? [];

  // profiles carries no foreign key from audit_logs — both point at auth.users
  // — so the names are read separately rather than embedded.
  const names = new Map<string, string | null>();
  const actorIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  if (actorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const person of people ?? []) names.set(person.id, person.full_name);
  }

  const events: AuditEvent[] = rows.map((row) => {
    const profile = row.user_id ? { full_name: names.get(row.user_id) ?? null } : null;
    return {
      id: row.id,
      action: row.action as AuditEvent["action"],
      entityType: row.entity_type,
      entityId: row.entity_id,
      // Null means the account has since been deleted, not that nobody acted.
      actor: profile?.full_name?.trim() || "A removed account",
      createdAt: row.created_at,
      oldData: row.old_data as AuditEvent["oldData"],
      newData: row.new_data as AuditEvent["newData"],
    };
  });

  // An account entry can be taken back for a week, and the activity log is
  // where that is done — so each event that refers to one carries its current
  // state. The database enforces the window regardless of what this says.
  const movementIds = [
    ...new Set(
      events
        .filter((e) => e.entityType === "account_movements" && e.entityId)
        .map((e) => e.entityId as string),
    ),
  ];

  if (movementIds.length > 0) {
    const { data: movements } = await supabase
      .from("account_movements")
      .select("id, undone_at, created_at, transfer_id")
      .in("id", movementIds);

    const byId = new Map(
      (movements ?? []).map((m) => [
        m.id,
        {
          movementId: m.id,
          undone: m.undone_at !== null,
          canUndo: Date.now() - new Date(m.created_at).getTime() < UNDO_WINDOW_MS,
          isTransfer: m.transfer_id !== null,
        },
      ]),
    );

    for (const event of events) {
      // Only the event that created the entry offers to take it back; the
      // events recording the undo itself are the history of that.
      if (event.entityType === "account_movements" && event.action === "created") {
        const state = byId.get(event.entityId ?? "");
        if (state) event.undoable = state;
      }
    }
  }

  return { events, total: count ?? 0, page };
}
