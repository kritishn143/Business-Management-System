import { createClient } from "@/lib/supabase/server";

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: string;
  purchase_price: string;
  minimum_stock: string;
  track_inventory: boolean;
  is_active: boolean;
  category: { name: string } | null;
  base_unit: { name: string; symbol: string } | null;
  balances: { quantity: string; average_cost: string; stock_value: string }[];
};

export type ProductListResult = {
  rows: ProductRow[];
  total: number;
};

const PAGE_SIZE = 50;

const SELECT = `
  id, name, sku, barcode, selling_price, purchase_price, minimum_stock,
  track_inventory, is_active,
  category:categories!products_category_same_business (name),
  base_unit:units!products_base_unit_same_business (name, symbol),
  balances:inventory_balances (quantity, average_cost, stock_value)
`;

/**
 * Server-side paging and filtering. The browser never receives the whole
 * catalogue (SPEC §48, §65).
 */
export async function listProducts({
  search,
  page = 1,
}: {
  search?: string;
  page?: number;
}): Promise<ProductListResult> {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("products")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const term = search?.trim();
  if (term) {
    // Escape PostgREST's or() delimiters before interpolating user input.
    const safe = term.replace(/[(),*]/g, " ").trim();
    if (safe) {
      query = query.or(
        `name.ilike.*${safe}*,sku.ilike.*${safe}*,barcode.ilike.*${safe}*`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[products] list", error.code, error.message);
    throw new Error("We couldn't load your products.");
  }

  return {
    rows: (data ?? []) as unknown as ProductRow[],
    total: count ?? 0,
  };
}

export type ProductFormOptions = {
  categories: { id: string; name: string }[];
  units: { id: string; name: string; symbol: string }[];
};

export async function loadProductFormOptions(): Promise<ProductFormOptions> {
  const supabase = await createClient();

  const [categories, units] = await Promise.all([
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("units").select("id, name, symbol").eq("is_active", true).order("conversion_factor"),
  ]);

  if (categories.error || units.error) {
    const e = categories.error ?? units.error;
    console.error("[products] formOptions", e?.code, e?.message);
    throw new Error("We couldn't load the product form.");
  }

  return { categories: categories.data ?? [], units: units.data ?? [] };
}

export const PRODUCTS_PAGE_SIZE = PAGE_SIZE;

export type ProductDetail = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  brand: string | null;
  purchase_price: string;
  selling_price: string;
  minimum_stock: string;
  track_inventory: boolean;
  is_active: boolean;
  created_at: string;
  category: { name: string } | null;
  base_unit: { name: string; symbol: string } | null;
  balances: { quantity: string; average_cost: string; stock_value: string }[];
};

export type MovementRow = {
  id: string;
  movement_type: string;
  quantity: string;
  unit_cost: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
};

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, sku, barcode, description, brand, purchase_price, selling_price,
      minimum_stock, track_inventory, is_active, created_at,
      category:categories!products_category_same_business (name),
      base_unit:units!products_base_unit_same_business (name, symbol),
      balances:inventory_balances (quantity, average_cost, stock_value)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[products] get", error.code, error.message);
    throw new Error("We couldn't load this product.");
  }

  return (data as unknown as ProductDetail | null) ?? null;
}

export async function listMovements(productId: string): Promise<MovementRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, movement_type, quantity, unit_cost, reason, notes, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[products] movements", error.code, error.message);
    throw new Error("We couldn't load the stock history.");
  }

  return (data ?? []) as MovementRow[];
}
