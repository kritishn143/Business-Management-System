import { createClient } from "@/lib/supabase/server";
import { hasEnded, isCurrent } from "./rules";

export type FiscalYear = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "closed";
  closedAt: string | null;
  /** Null until the year is closed, or if the reader may not see balances. */
  closing: { parties: number; stockValue: number; accounts: number } | null;
  /** Whether the year has finished, so closing it is even possible. */
  ended: boolean;
  /** Whether today falls inside it. */
  current: boolean;
};

export async function listFiscalYears(today: string): Promise<FiscalYear[]> {
  const supabase = await createClient();

  const [years, balances] = await Promise.all([
    supabase
      .from("fiscal_years")
      .select("id, name, starts_on, ends_on, status, closed_at")
      .order("starts_on", { ascending: false }),
    supabase
      .from("fiscal_year_balances")
      .select("fiscal_year_id, kind, amount"),
  ]);

  if (years.error) {
    console.error("[fiscal] list", years.error.code, years.error.message);
    throw new Error("We couldn't load your financial years.");
  }

  // A cashier cannot read balances; that is a quieter "null", not an error.
  const totals = new Map<string, { parties: number; stockValue: number; accounts: number }>();
  for (const row of balances.data ?? []) {
    const entry =
      totals.get(row.fiscal_year_id) ?? { parties: 0, stockValue: 0, accounts: 0 };
    const amount = Number(row.amount);
    if (row.kind === "party") entry.parties += amount;
    if (row.kind === "product") entry.stockValue += amount;
    if (row.kind === "account") entry.accounts += amount;
    totals.set(row.fiscal_year_id, entry);
  }

  return (years.data ?? []).map((y) => ({
    id: y.id,
    name: y.name,
    startsOn: y.starts_on,
    endsOn: y.ends_on,
    status: y.status as "open" | "closed",
    closedAt: y.closed_at,
    closing: totals.get(y.id) ?? null,
    ended: hasEnded({ endsOn: y.ends_on }, today),
    current: isCurrent({ startsOn: y.starts_on, endsOn: y.ends_on }, today),
  }));
}
