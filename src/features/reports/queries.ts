import { createClient } from "@/lib/supabase/server";
import { grossProfit, netProfit, type ProfitSummary } from "@/domain/reports/profit";
import { fromDecimalString } from "@/domain/money/decimal";

export type DateRange = { from: string; to: string; label: string };

/** Ranges are resolved in the shop's timezone, not the server's (SPEC §68). */
export function resolveRange(preset: string, timezone: string): DateRange {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  switch (preset) {
    case "yesterday":
      return { from: day(-1), to: day(-1), label: "Yesterday" };
    case "week":
      return { from: day(-6), to: today, label: "Last 7 days" };
    case "month":
      return { from: day(-29), to: today, label: "Last 30 days" };
    case "quarter":
      return { from: day(-89), to: today, label: "Last 90 days" };
    case "today":
    default:
      return { from: today, to: today, label: "Today" };
  }
}

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "quarter", label: "Last 90 days" },
] as const;

export type SalesReport = {
  profit: ProfitSummary;
  net: number;
  expenses: number;
  otherIncome: number;
  saleCount: number;
  byProduct: { name: string; quantity: number; revenue: number; profit: number }[];
  byMethod: { method: string; amount: number }[];
};

export async function loadSalesReport(range: DateRange): Promise<SalesReport> {
  const supabase = await createClient();

  // Dates are inclusive, so the upper bound is the start of the next day.
  const to = new Date(`${range.to}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const upper = to.toISOString().slice(0, 10);

  const [sales, expenses, income] = await Promise.all([
    supabase
      .from("sales")
      .select(`
        id,
        payments:sale_payments (method, amount),
        items:sale_items (quantity, line_total, cost_price, products (name))
      `)
      .eq("status", "posted")
      .gte("sale_date", range.from)
      .lt("sale_date", upper),
    supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", range.from)
      .lte("expense_date", range.to),
    supabase
      .from("income_entries")
      .select("amount")
      .gte("income_date", range.from)
      .lte("income_date", range.to),
  ]);

  if (sales.error) {
    console.error("[reports] sales", sales.error.code, sales.error.message);
    throw new Error("We couldn't build that report.");
  }

  type Item = {
    quantity: string;
    line_total: string;
    cost_price: string;
    products: { name: string } | null;
  };
  type Payment = { method: string; amount: string };

  const rows = (sales.data ?? []) as unknown as {
    id: string;
    payments: Payment[];
    items: Item[];
  }[];

  const allItems = rows.flatMap((s) => s.items ?? []);

  const profit = grossProfit(
    allItems.map((i) => ({
      quantity: Number(i.quantity),
      lineTotal: i.line_total,
      costPrice: i.cost_price,
    })),
  );

  const byProductMap = new Map<string, { quantity: number; revenue: number; profit: number }>();
  for (const i of allItems) {
    const name = i.products?.name ?? "Deleted product";
    const qty = Number(i.quantity);
    const revenue = Number(i.line_total);
    const cost = Number(i.cost_price) * qty;
    const existing = byProductMap.get(name) ?? { quantity: 0, revenue: 0, profit: 0 };
    byProductMap.set(name, {
      quantity: existing.quantity + qty,
      revenue: existing.revenue + revenue,
      profit: existing.profit + (revenue - cost),
    });
  }

  const byMethodMap = new Map<string, number>();
  for (const p of rows.flatMap((s) => s.payments ?? [])) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + Number(p.amount));
  }

  const expenseTotal = (expenses.data ?? []).reduce((t, r) => t + Number(r.amount), 0);
  const incomeTotal = (income.data ?? []).reduce((t, r) => t + Number(r.amount), 0);

  return {
    profit,
    net: netProfit({
      gross: profit.grossProfit,
      expenses: fromDecimalString(expenseTotal),
      otherIncome: fromDecimalString(incomeTotal),
    }),
    expenses: expenseTotal,
    otherIncome: incomeTotal,
    saleCount: rows.length,
    byProduct: [...byProductMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20),
    byMethod: [...byMethodMap.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
