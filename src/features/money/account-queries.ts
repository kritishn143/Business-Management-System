import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/types/database";
import { REMOVABLE_KINDS } from "./ledger-kinds";

export type AccountSummary = {
  id: string;
  name: string;
  type: AccountType;
  isDefault: boolean;
  isActive: boolean;
  /** Derived from everything that moved through it — never a stored figure. */
  balance: number;
};

export type LedgerRow = {
  kind: string;
  movedOn: string;
  happenedAt: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  referenceId: string;
  /** Running balance after this movement, oldest to newest. */
  runningBalance: number;
  /** Taken back, so it no longer counts towards the balance. */
  undone: boolean;
  /** Still inside the week in which it can be taken back or put back. */
  canUndo: boolean;
  /** Lives in account_movements, so undo applies to it at all. */
  reversible: boolean;
};

/**
 * Every account with what it holds. One query for the accounts and one for all
 * their movements, rather than a balance call per account (SPEC §65).
 */
export async function listAccounts(): Promise<AccountSummary[]> {
  const supabase = await createClient();

  const [accounts, ledger] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, is_default, is_active")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.rpc("account_ledger", { target_account: null }),
  ]);

  if (accounts.error) {
    console.error("[accounts] list", accounts.error.code, accounts.error.message);
    throw new Error("We couldn't load your accounts.");
  }
  if (ledger.error) {
    console.error("[accounts] ledger", ledger.error.code, ledger.error.message);
    throw new Error("We couldn't work out your balances.");
  }

  const balances = new Map<string, number>();
  for (const row of (ledger.data ?? []) as {
    account_id: string;
    money_in: string;
    money_out: string;
  }[]) {
    const current = balances.get(row.account_id) ?? 0;
    balances.set(row.account_id, current + Number(row.money_in) - Number(row.money_out));
  }

  return (accounts.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    isDefault: a.is_default,
    isActive: a.is_active,
    balance: balances.get(a.id) ?? 0,
  }));
}

export async function getAccount(id: string): Promise<AccountSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type, is_default, is_active, opening_balance")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[accounts] get", error.code, error.message);
    throw new Error("We couldn't load that account.");
  }
  if (!data) return null;

  const { data: balance } = await supabase.rpc("account_balance", {
    target_account: id,
  });

  return {
    id: data.id,
    name: data.name,
    type: data.type as AccountType,
    isDefault: data.is_default,
    isActive: data.is_active,
    balance: Number(balance ?? 0),
  };
}

export type LedgerFilter = {
  /** Matches the description, so a shopkeeper can find "rent" or "NIC".*/
  search?: string;
  /** One of the kinds, or undefined for everything. */
  kind?: string;
  /** "newest" (default) or "oldest". */
  order?: string;
};

/** What moved through an account, each with the balance it left behind. */
export async function listAccountLedger(
  id: string,
  filter: LedgerFilter = {},
): Promise<LedgerRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("account_ledger", { target_account: id });

  if (error) {
    console.error("[accounts] ledger", error.code, error.message);
    throw new Error("We couldn't load that account's history.");
  }

  const rows = ((data ?? []) as {
    kind: string;
    moved_on: string;
    happened_at: string;
    description: string;
    money_in: string;
    money_out: string;
    reference_id: string;
    undone: boolean;
    can_undo: boolean;
  }[])
    // Oldest first, so a running balance can be accumulated.
    .sort((a, b) => a.moved_on.localeCompare(b.moved_on) || a.happened_at.localeCompare(b.happened_at));

  let running = 0;
  const withBalance = rows.map((r) => {
    // An entry that was taken back stays in the history but does not count.
    if (!r.undone) running += Number(r.money_in) - Number(r.money_out);
    return {
      kind: r.kind,
      undone: r.undone,
      canUndo: r.can_undo,
      reversible: REMOVABLE_KINDS.includes(r.kind),
      movedOn: r.moved_on,
      happenedAt: r.happened_at,
      description: r.description,
      moneyIn: Number(r.money_in),
      moneyOut: Number(r.money_out),
      referenceId: r.reference_id,
      runningBalance: running,
    };
  });

  // The running balance is worked out over the whole history first, so
  // filtering never changes what any row says the balance was.
  let visible = withBalance;

  if (filter.kind) {
    visible = visible.filter((r) => r.kind === filter.kind);
  }

  const term = filter.search?.trim().toLowerCase();
  if (term) {
    visible = visible.filter((r) => r.description.toLowerCase().includes(term));
  }

  return filter.order === "oldest" ? visible : visible.reverse();
}
