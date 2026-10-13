import { createClient } from "@/lib/supabase/server";

export type Overview = {
  productCount: number;
  trackedCount: number;
  stockValue: number;
  lowStock: AttentionItem[];
  outOfStock: AttentionItem[];
  recentMovements: {
    id: string;
    product_name: string;
    movement_type: string;
    quantity: string;
    created_at: string;
  }[];
};

export type AttentionItem = {
  id: string;
  name: string;
  quantity: number;
  minimum: number;
  unit: string;
};

type ProductAggregate = {
  id: string;
  name: string;
  minimum_stock: string;
  track_inventory: boolean;
  base_unit: { symbol: string } | null;
  balances: { quantity: string; stock_value: string }[];
};

/**
 * One round trip for the whole overview. Aggregation happens here rather than
 * in the page so the numbers have a single definition (SPEC §46).
 */
export async function loadOverview(): Promise<Overview> {
  const supabase = await createClient();

  const [products, movements] = await Promise.all([
    supabase
      .from("products")
      .select(`
        id, name, minimum_stock, track_inventory,
        base_unit:units!products_base_unit_same_business (symbol),
        balances:inventory_balances (quantity, stock_value)
      `)
      .eq("is_active", true),
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity, created_at, products (name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (products.error) {
    console.error("[dashboard] products", products.error.code, products.error.message);
    throw new Error("We couldn't load your overview.");
  }
  if (movements.error) {
    console.error("[dashboard] movements", movements.error.code, movements.error.message);
    throw new Error("We couldn't load your overview.");
  }

  const rows = (products.data ?? []) as unknown as ProductAggregate[];

  let stockValue = 0;
  let trackedCount = 0;
  const lowStock: AttentionItem[] = [];
  const outOfStock: AttentionItem[] = [];

  for (const p of rows) {
    if (!p.track_inventory) continue;
    trackedCount += 1;

    const balance = p.balances?.[0];
    const quantity = Number(balance?.quantity ?? 0);
    const minimum = Number(p.minimum_stock);
    stockValue += Number(balance?.stock_value ?? 0);

    const item: AttentionItem = {
      id: p.id,
      name: p.name,
      quantity,
      minimum,
      unit: p.base_unit?.symbol ?? "",
    };

    if (quantity <= 0) outOfStock.push(item);
    else if (minimum > 0 && quantity <= minimum) lowStock.push(item);
  }

  // Most urgent first: the furthest below its threshold.
  lowStock.sort((a, b) => a.quantity / (a.minimum || 1) - b.quantity / (b.minimum || 1));

  return {
    productCount: rows.length,
    trackedCount,
    stockValue,
    lowStock: lowStock.slice(0, 5),
    outOfStock: outOfStock.slice(0, 5),
    recentMovements: (movements.data ?? []).map((m) => ({
      id: m.id as string,
      product_name:
        (m.products as unknown as { name: string } | null)?.name ?? "Deleted product",
      movement_type: m.movement_type as string,
      quantity: m.quantity as string,
      created_at: m.created_at as string,
    })),
  };
}
