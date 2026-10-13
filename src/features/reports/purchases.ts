import { fromDecimalString, type Money } from "@/domain/money/decimal";
import { createClient } from "@/lib/supabase/server";
import type { DateRange } from "./queries";

export type PurchasesReport = {
  total: Money;
  paid: Money;
  owing: Money;
  billCount: number;
  bySupplier: { name: string; bills: number; total: Money; owing: Money }[];
  byProduct: { name: string; quantity: number; cost: Money }[];
  returned: Money;
};

/** Inclusive upper bound needs the following day. */
function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** What the shop bought over a period, and from whom (SPEC §20). */
export async function loadPurchasesReport(range: DateRange): Promise<PurchasesReport> {
  const supabase = await createClient();
  const upper = dayAfter(range.to);

  const [purchases, items, returns] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, total_amount, paid_amount, due_amount, supplier:parties!purchases_supplier_same_business (name)",
      )
      .eq("status", "posted")
      .gte("purchase_date", range.from)
      .lt("purchase_date", upper),
    supabase
      .from("purchase_items")
      .select(
        "quantity, line_total, products!purchase_items_product_same_business (name), purchases!inner (purchase_date, status)",
      )
      .eq("purchases.status", "posted")
      .gte("purchases.purchase_date", range.from)
      .lt("purchases.purchase_date", upper),
    supabase
      .from("purchase_returns")
      .select("total_amount")
      .gte("return_date", range.from)
      .lt("return_date", upper),
  ]);

  const failure = purchases.error ?? items.error ?? returns.error;
  if (failure) {
    console.error("[reports] purchases", failure.code, failure.message);
    throw new Error("We couldn't build that report.");
  }

  let total = 0;
  let paid = 0;
  let owing = 0;

  const suppliers = new Map<string, { bills: number; total: Money; owing: Money }>();

  for (const bill of purchases.data ?? []) {
    total += fromDecimalString(bill.total_amount);
    paid += fromDecimalString(bill.paid_amount);
    owing += fromDecimalString(bill.due_amount);

    const supplier = bill.supplier as unknown as { name: string } | null;
    const name = supplier?.name ?? "No supplier recorded";
    const entry = suppliers.get(name) ?? { bills: 0, total: 0, owing: 0 };
    entry.bills += 1;
    entry.total += fromDecimalString(bill.total_amount);
    entry.owing += fromDecimalString(bill.due_amount);
    suppliers.set(name, entry);
  }

  const products = new Map<string, { quantity: number; cost: Money }>();

  for (const item of items.data ?? []) {
    const product = item.products as unknown as { name: string } | null;
    const name = product?.name ?? "Deleted product";
    const entry = products.get(name) ?? { quantity: 0, cost: 0 };
    entry.quantity += Number(item.quantity);
    entry.cost += fromDecimalString(item.line_total);
    products.set(name, entry);
  }

  return {
    total,
    paid,
    owing,
    billCount: (purchases.data ?? []).length,
    bySupplier: [...suppliers.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),
    byProduct: [...products.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost),
    returned: (returns.data ?? []).reduce(
      (t, r) => t + fromDecimalString(r.total_amount),
      0,
    ),
  };
}
