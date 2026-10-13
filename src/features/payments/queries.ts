import { createClient } from "@/lib/supabase/server";

export type PaymentRow = {
  id: string;
  direction: "in" | "out";
  amount: string;
  description: string | null;
  createdAt: string;
  party: { id: string; name: string; type: string } | null;
};

export type PartyChoice = { id: string; name: string; type: string };

const PAGE_SIZE = 50;

/**
 * Payments are ledger entries, not a table of their own: a party's balance is
 * only ever derived from the ledger (SPEC §34).
 */
export async function listPayments(): Promise<PaymentRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("party_ledger_entries")
    .select(
      "id, entry_type, debit, credit, description, created_at, parties!party_ledger_party_same_business (id, name, type)",
    )
    .in("entry_type", ["payment_in", "payment_out"])
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("[payments] list", error.code, error.message);
    throw new Error("We couldn't load your payments.");
  }

  return (data ?? []).map((row) => {
    const isIn = row.entry_type === "payment_in";
    return {
      id: row.id,
      direction: isIn ? ("in" as const) : ("out" as const),
      // Money received is a credit; money paid out a debit.
      amount: isIn ? row.credit : row.debit,
      description: row.description,
      createdAt: row.created_at,
      party: row.parties as unknown as PaymentRow["party"],
    };
  });
}

/** Everyone a payment could be recorded against. */
export async function listPartyChoices(): Promise<PartyChoice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parties")
    .select("id, name, type")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[payments] parties", error.code, error.message);
    throw new Error("We couldn't load your contacts.");
  }

  return data ?? [];
}
