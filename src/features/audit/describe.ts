import type { AuditEvent } from "./queries";

/**
 * Audit rows are shaped for the database, not for reading. This turns one into
 * a sentence a shopkeeper can scan (SPEC §61).
 */
const ENTITY_LABELS: Record<string, { one: string; verb?: Partial<Record<AuditEvent["action"], string>> }> = {
  account_movements: { one: "account entry" },
  invoice_settings: { one: "invoice settings", verb: { updated: "changed" } },
  fiscal_years: { one: "financial year", verb: { updated: "closed or reopened" } },
  businesses: { one: "business settings", verb: { created: "set up", updated: "changed", deleted: "closed" } },
  business_members: { one: "staff access" },
  sales: { one: "sale" },
  sale_items: { one: "sale line" },
  sale_payments: { one: "payment on a sale" },
  sale_returns: { one: "sales return" },
  sale_return_items: { one: "sales return line" },
  purchases: { one: "purchase" },
  purchase_items: { one: "purchase line" },
  purchase_returns: { one: "purchase return" },
  purchase_return_items: { one: "purchase return line" },
  stock_movements: { one: "stock movement" },
  party_ledger_entries: { one: "ledger entry" },
  expenses: { one: "expense" },
  income_entries: { one: "other income" },
  accounts: { one: "cash or bank account" },
  parties: { one: "customer or supplier" },
  products: { one: "product" },
};

const ACTION_VERBS: Record<AuditEvent["action"], string> = {
  created: "added",
  updated: "changed",
  deleted: "removed",
};

/** A short label for the thing that changed, e.g. "sale". */
export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType]?.one ?? entityType.replace(/_/g, " ");
}

/**
 * Taking an entry back only sets two bookkeeping columns, which reads as
 * gibberish. Recognise it and say what actually happened.
 */
function undoChange(event: AuditEvent): "took back" | "put back" | null {
  if (event.entityType !== "account_movements" || event.action !== "updated") return null;
  if (!event.oldData || !event.newData) return null;

  const was = event.oldData.undone_at ?? null;
  const now = event.newData.undone_at ?? null;
  if (was === now) return null;

  return now === null ? "put back" : "took back";
}

export function describeAction(event: AuditEvent): string {
  return (
    undoChange(event) ??
    ENTITY_LABELS[event.entityType]?.verb?.[event.action] ??
    ACTION_VERBS[event.action]
  );
}

/** Fields worth naming in a list; ids and timestamps are noise here. */
const HIDDEN = new Set([
  "id",
  "business_id",
  "created_at",
  "updated_at",
  "created_by",
  "slug",
  // Set by taking an entry back, which is described in words instead.
  "undone_at",
  "undone_by",
  // Internal links: an id tells a shopkeeper nothing.
  "account_id",
  "category_id",
  "product_id",
  "party_id",
  "customer_id",
  "supplier_id",
  "sale_id",
  "purchase_id",
  "location_id",
  "unit_id",
  "base_unit_id",
  "user_id",
  "transfer_id",
  "client_transaction_id",
  "reference_id",
  "reference_type",
  "closed_by",
]);

const PREFERRED = [
  "invoice_number",
  "return_number",
  "name",
  "description",
  "total_amount",
  "amount",
  "quantity",
  "movement_type",
  "role",
  "status",
];

/**
 * The one detail most likely to identify the row — an invoice number, a name,
 * an amount — so the list says *which* sale, not just "a sale".
 */
export function subjectOf(event: AuditEvent): string | null {
  const row = event.newData ?? event.oldData;
  if (!row) return null;

  for (const key of PREFERRED) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    // A draft sale is created with a zero total, and "sale · 0" identifies
    // nothing. Keep looking for something that does.
    if (typeof value !== "boolean" && Number(value) === 0) continue;
    return String(value);
  }
  return null;
}

/**
 * What actually changed in an edit. Comparing serialised values keeps this
 * honest about numerics, which arrive as strings.
 */
export function changedFields(event: AuditEvent): { field: string; from: string; to: string }[] {
  if (event.action !== "updated" || !event.oldData || !event.newData) return [];

  const keys = new Set([...Object.keys(event.oldData), ...Object.keys(event.newData)]);
  const changes: { field: string; from: string; to: string }[] = [];

  for (const key of keys) {
    if (HIDDEN.has(key)) continue;
    const before = event.oldData[key];
    const after = event.newData[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({
      field: key.replace(/_/g, " "),
      from: before === null || before === undefined ? "—" : String(before),
      to: after === null || after === undefined ? "—" : String(after),
    });
  }

  return changes;
}
