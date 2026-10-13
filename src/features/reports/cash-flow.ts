import { fromDecimalString, type Money } from "@/domain/money/decimal";
import { createClient } from "@/lib/supabase/server";
import type { DateRange } from "./queries";

export type CashFlowLine = { label: string; amount: Money };

export type CashFlowReport = {
  moneyIn: CashFlowLine[];
  moneyOut: CashFlowLine[];
  totalIn: Money;
  totalOut: Money;
  net: Money;
  /** Counter takings split by how the customer paid. */
  byMethod: CashFlowLine[];
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  qr: "QR",
  card: "Card",
  wallet: "Wallet",
  credit: "On credit",
  other: "Other",
};

/** The upper bound is exclusive, so an inclusive range needs the next day. */
function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function total(lines: CashFlowLine[]): Money {
  return lines.reduce((t, l) => t + l.amount, 0);
}

function groupSums(rows: { key: string; amount: string | number }[]): CashFlowLine[] {
  const sums = new Map<string, Money>();
  for (const row of rows) {
    sums.set(row.key, (sums.get(row.key) ?? 0) + fromDecimalString(row.amount));
  }
  return [...sums.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Where money came from and where it went over a period (SPEC §20).
 *
 * Counter takings come from the payments recorded on each sale; money collected
 * later against a credit sale comes from the party ledger. Keeping those two
 * apart is what stops a credit sale being counted as cash twice — once when the
 * goods left, and again when the customer paid.
 *
 * Sale payments carry a method rather than an account, so this report groups by
 * how money moved, not by which drawer it landed in.
 */
export async function loadCashFlowReport(range: DateRange): Promise<CashFlowReport> {
  const supabase = await createClient();
  const upper = dayAfter(range.to);

  const [counter, ledger, expenses, income] = await Promise.all([
    supabase
      .from("sale_payments")
      .select("method, amount, sales!inner (sale_date, status)")
      .eq("sales.status", "posted")
      .gte("sales.sale_date", range.from)
      .lt("sales.sale_date", upper),
    supabase
      .from("party_ledger_entries")
      .select("entry_type, debit, credit, created_at")
      .in("entry_type", ["payment_in", "payment_out"])
      .gte("created_at", range.from)
      .lt("created_at", upper),
    supabase
      .from("expenses")
      .select("amount, expense_categories!expenses_category_same_business (name)")
      .gte("expense_date", range.from)
      .lte("expense_date", range.to),
    supabase
      .from("income_entries")
      .select("amount, income_categories!income_entries_category_same_business (name)")
      .gte("income_date", range.from)
      .lte("income_date", range.to),
  ]);

  const failure = counter.error ?? ledger.error ?? expenses.error ?? income.error;
  if (failure) {
    console.error("[reports] cash flow", failure.code, failure.message);
    throw new Error("We couldn't build that report.");
  }

  const byMethod = groupSums(
    (counter.data ?? []).map((row) => ({
      key: METHOD_LABEL[row.method] ?? row.method,
      amount: row.amount,
    })),
  );

  const counterTotal = total(byMethod);

  // A payment in is a credit on the customer's account; a payment out a debit.
  const collected = (ledger.data ?? [])
    .filter((row) => row.entry_type === "payment_in")
    .reduce((t, row) => t + fromDecimalString(row.credit), 0);
  const paidOut = (ledger.data ?? [])
    .filter((row) => row.entry_type === "payment_out")
    .reduce((t, row) => t + fromDecimalString(row.debit), 0);

  const incomeLines = groupSums(
    (income.data ?? []).map((row) => {
      const category = row.income_categories as unknown as { name: string } | null;
      return { key: category?.name ?? "Other income", amount: row.amount };
    }),
  );

  const expenseLines = groupSums(
    (expenses.data ?? []).map((row) => {
      const category = row.expense_categories as unknown as { name: string } | null;
      return { key: category?.name ?? "Uncategorised", amount: row.amount };
    }),
  );

  const moneyIn: CashFlowLine[] = [
    { label: "Taken at the counter", amount: counterTotal },
    { label: "Collected from customers", amount: collected },
    ...incomeLines,
  ].filter((l) => l.amount !== 0);

  const moneyOut: CashFlowLine[] = [
    { label: "Paid to suppliers", amount: paidOut },
    ...expenseLines,
  ].filter((l) => l.amount !== 0);

  const totalIn = total(moneyIn);
  const totalOut = total(moneyOut);

  return {
    moneyIn,
    moneyOut,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    byMethod,
  };
}
