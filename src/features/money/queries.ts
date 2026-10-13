import { createClient } from "@/lib/supabase/server";
import type { MoneyEntry, MoneyKind, MoneyOptions } from "./types";

export type { MoneyKind, MoneyEntry, MoneyOptions } from "./types";

export async function loadMoneyOptions(kind: MoneyKind): Promise<MoneyOptions> {
  const supabase = await createClient();
  const table = kind === "expense" ? "expense_categories" : "income_categories";

  const [categories, accounts] = await Promise.all([
    supabase.from(table).select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("accounts")
      .select("id, name, is_default")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (categories.error || accounts.error) {
    const e = categories.error ?? accounts.error;
    console.error("[money] options", e?.code, e?.message);
    throw new Error("We couldn't load the form.");
  }

  return { categories: categories.data ?? [], accounts: accounts.data ?? [] };
}

export async function listMoneyEntries(kind: MoneyKind): Promise<MoneyEntry[]> {
  const supabase = await createClient();
  const table = kind === "expense" ? "expenses" : "income_entries";
  const dateColumn = kind === "expense" ? "expense_date" : "income_date";
  const categoryFk =
    kind === "expense"
      ? "expense_categories!expenses_category_same_business"
      : "income_categories!income_entries_category_same_business";
  const accountFk =
    kind === "expense"
      ? "accounts!expenses_account_same_business"
      : "accounts!income_entries_account_same_business";

  const { data, error } = await supabase
    .from(table)
    .select(
      `id, amount, ${dateColumn}, description, category_id, account_id,
       category:${categoryFk} (name),
       account:${accountFk} (name)`,
    )
    .order(dateColumn, { ascending: false })
    .limit(100);

  if (error) {
    console.error("[money] list", error.code, error.message);
    throw new Error("We couldn't load these records.");
  }

  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      id: r.id as string,
      amount: r.amount as string,
      entry_date: r[dateColumn] as string,
      description: (r.description as string | null) ?? null,
      categoryId: (r.category_id as string | null) ?? null,
      accountId: (r.account_id as string | null) ?? null,
      category: (r.category as { name: string } | null) ?? null,
      account: (r.account as { name: string } | null) ?? null,
    };
  });
}

/** Totals for the money overview. */
export async function loadMoneySummary() {
  const supabase = await createClient();

  const [expenses, income, accounts, payments, ledger] = await Promise.all([
    supabase.from("expenses").select("amount"),
    supabase.from("income_entries").select("amount"),
    supabase.from("accounts").select("id, name, type, opening_balance").eq("is_active", true).order("name"),
    supabase
      .from("party_ledger_entries")
      .select("debit, credit")
      .in("entry_type", ["payment_in", "payment_out"]),
    supabase.rpc("account_ledger", { target_account: null }),
  ]);

  const total = (rows: { amount: string }[] | null) =>
    (rows ?? []).reduce((t, r) => t + Number(r.amount), 0);

  return {
    expenseTotal: total(expenses.data),
    incomeTotal: total(income.data),
    accounts: accounts.data ?? [],
    // Payments settle accounts in both directions, so the tile shows how much
    // money moved that way, not a net figure that would read as nothing.
    paymentTotal: (payments.data ?? []).reduce(
      (t, r) => t + Number(r.debit) + Number(r.credit),
      0,
    ),
    // What the accounts actually hold, derived from every movement through them.
    accountTotal: ((ledger.data ?? []) as { money_in: string; money_out: string }[]).reduce(
      (t, r) => t + Number(r.money_in) - Number(r.money_out),
      0,
    ),
  };
}
