import { createClient } from "@/lib/supabase/server";

export type SaleDetail = {
  id: string;
  invoice_number: string | null;
  status: string;
  sale_date: string;
  subtotal: string;
  discount_amount: string;
  total_amount: string;
  paid_amount: string;
  due_amount: string;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  items: SaleItemRow[];
  payments: { method: string; amount: string }[];
};

export type SaleItemRow = {
  id: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  line_total: string;
  cost_price: string;
  product: { name: string } | null;
  unit: { symbol: string } | null;
  /** How much of this line has already come back. */
  returned: number;
};

export async function getSale(id: string): Promise<SaleDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales")
    .select(`
      id, invoice_number, status, sale_date, subtotal, discount_amount,
      total_amount, paid_amount, due_amount, notes,
      customer:parties!sales_customer_same_business (id, name, phone),
      items:sale_items (
        id, quantity, unit_price, discount_amount, line_total, cost_price,
        product:products!sale_items_product_same_business (name),
        unit:units!sale_items_unit_same_business (symbol)
      ),
      payments:sale_payments (method, amount)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[sales] get", error.code, error.message);
    throw new Error("We couldn't load that sale.");
  }
  if (!data) return null;

  const sale = data as unknown as Omit<SaleDetail, "items"> & {
    items: Omit<SaleItemRow, "returned">[];
  };

  // Already-returned quantities, so the form can cap each line correctly.
  const { data: returned } = await supabase
    .from("sale_return_items")
    .select("sale_item_id, quantity")
    .in("sale_item_id", sale.items.map((i) => i.id));

  const returnedBy = new Map<string, number>();
  for (const r of returned ?? []) {
    const key = r.sale_item_id as string;
    returnedBy.set(key, (returnedBy.get(key) ?? 0) + Number(r.quantity));
  }

  return {
    ...sale,
    items: sale.items.map((i) => ({ ...i, returned: returnedBy.get(i.id) ?? 0 })),
  };
}

export async function listSaleReturns(saleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_returns")
    .select("id, return_number, return_date, total_amount, refunded_amount, reason")
    .eq("sale_id", saleId)
    .eq("status", "posted")
    .order("return_date", { ascending: false });

  if (error) {
    console.error("[sales] returns", error.code, error.message);
    return [];
  }
  return data ?? [];
}
