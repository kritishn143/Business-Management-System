import { ageBalance, type Ageing } from "@/domain/finance/ageing";
import { createClient } from "@/lib/supabase/server";
import { localCalendarDate } from "@/lib/format";

export type AgeingRow = {
  partyId: string;
  name: string;
  phone: string | null;
  ageing: Ageing;
};

export type AgeingReport = {
  /** The day the report is aged to, in the shop's own calendar terms. */
  asOf: string;
  rows: AgeingRow[];
  totals: Ageing["buckets"] & { balance: number };
};

/**
 * Who owes the shop, or whom the shop owes, and for how long.
 *
 * Payments are recorded against the party rather than against an invoice
 * (SPEC §34), so ageing is derived by applying credits to the oldest debits.
 * For suppliers the ledger's sign is mirrored — a bill is a credit because we
 * owe them — so the two sides are swapped before ageing, and the report then
 * reads as "what we owe" throughout.
 */
export async function loadAgeingReport({
  kind,
  timezone,
}: {
  kind: "receivable" | "payable";
  timezone: string;
}): Promise<AgeingReport> {
  const supabase = await createClient();
  const asOf = localCalendarDate(new Date().toISOString(), timezone);
  const partyTypes = kind === "receivable" ? ["customer", "both"] : ["supplier", "both"];

  const [parties, ledger] = await Promise.all([
    supabase
      .from("parties")
      .select("id, name, phone, opening_balance, created_at")
      .in("type", partyTypes)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("party_ledger_entries")
      .select("party_id, debit, credit, created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (parties.error || ledger.error) {
    const error = parties.error ?? ledger.error;
    console.error("[reports] ageing", error?.code, error?.message);
    throw new Error("We couldn't build that report.");
  }

  const entriesByParty = new Map<
    string,
    { date: string; debit: string; credit: string }[]
  >();

  for (const entry of ledger.data ?? []) {
    const list = entriesByParty.get(entry.party_id) ?? [];
    list.push({
      // The calendar day the entry belongs to in the shop's timezone (SPEC §68).
      date: localCalendarDate(entry.created_at, timezone),
      debit: kind === "receivable" ? entry.debit : entry.credit,
      credit: kind === "receivable" ? entry.credit : entry.debit,
    });
    entriesByParty.set(entry.party_id, list);
  }

  const rows: AgeingRow[] = [];

  for (const party of parties.data ?? []) {
    const opening = Number(party.opening_balance ?? 0);
    const ageing = ageBalance({
      entries: entriesByParty.get(party.id) ?? [],
      openingBalance: kind === "receivable" ? opening : -opening,
      openingDate: localCalendarDate(party.created_at, timezone),
      asOf,
    });

    // A party who is square with us is not part of this report.
    if (ageing.balance === 0 && ageing.unapplied === 0) continue;

    rows.push({
      partyId: party.id,
      name: party.name,
      phone: party.phone,
      ageing,
    });
  }

  // Worst first: this report exists to be acted on.
  rows.sort((a, b) => b.ageing.balance - a.ageing.balance);

  const totals = rows.reduce(
    (acc, row) => ({
      current: acc.current + row.ageing.buckets.current,
      d30: acc.d30 + row.ageing.buckets.d30,
      d60: acc.d60 + row.ageing.buckets.d60,
      d90: acc.d90 + row.ageing.buckets.d90,
      balance: acc.balance + row.ageing.balance,
    }),
    { current: 0, d30: 0, d60: 0, d90: 0, balance: 0 },
  );

  return { asOf, rows, totals };
}
