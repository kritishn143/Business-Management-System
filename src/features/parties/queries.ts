import { createClient } from "@/lib/supabase/server";

export type PartyRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: "customer" | "supplier" | "both";
  opening_balance: string;
  credit_limit: string | null;
  is_active: boolean;
  balance: number;
};

export type PartyKind = "customer" | "supplier";

/**
 * Balances come from the database function, so the list, the detail page and
 * any report all read the same derived number (SPEC §34).
 */
export async function listParties(kind: PartyKind): Promise<PartyRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parties")
    .select("id, name, phone, email, type, opening_balance, credit_limit, is_active")
    .in("type", [kind, "both"])
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[parties] list", error.code, error.message);
    throw new Error("We couldn't load your contacts.");
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const balances = await Promise.all(
    rows.map(async (p) => {
      const { data: b } = await supabase.rpc("party_balance", { target_party: p.id });
      return Number(b ?? 0);
    }),
  );

  return rows.map((p, i) => ({ ...p, balance: balances[i] })) as PartyRow[];
}

export type PartyDetail = PartyRow & { address: string | null; notes: string | null };

export type LedgerRow = {
  id: string;
  entry_type: string;
  debit: string;
  credit: string;
  description: string | null;
  created_at: string;
};

export async function getParty(id: string): Promise<PartyDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parties")
    .select("id, name, phone, email, address, notes, type, opening_balance, credit_limit, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[parties] get", error.code, error.message);
    throw new Error("We couldn't load this contact.");
  }
  if (!data) return null;

  const { data: b } = await supabase.rpc("party_balance", { target_party: id });
  return { ...data, balance: Number(b ?? 0) } as PartyDetail;
}

export async function listLedger(partyId: string): Promise<LedgerRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("party_ledger_entries")
    .select("id, entry_type, debit, credit, description, created_at")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[parties] ledger", error.code, error.message);
    throw new Error("We couldn't load the statement.");
  }

  return (data ?? []) as LedgerRow[];
}
