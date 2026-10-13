"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchHit = {
  id: string;
  label: string;
  detail: string | null;
  href: string;
  group: "Products" | "Customers" | "Suppliers" | "Invoices";
};

/**
 * Global search across the things a shopkeeper looks for by name (SPEC §49).
 * Each query is capped, and RLS keeps results inside the business.
 */
export async function globalSearch(term: string): Promise<SearchHit[]> {
  const safe = term.trim().replace(/[(),*]/g, " ").trim();
  if (safe.length < 2) return [];

  const supabase = await createClient();

  const [products, parties, sales] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku")
      .or(`name.ilike.*${safe}*,sku.ilike.*${safe}*,barcode.ilike.*${safe}*`)
      .eq("is_active", true)
      .limit(6),
    supabase
      .from("parties")
      .select("id, name, phone, type")
      .or(`name.ilike.*${safe}*,phone.ilike.*${safe}*`)
      .eq("is_active", true)
      .limit(6),
    supabase
      .from("sales")
      .select("id, invoice_number")
      .ilike("invoice_number", `%${safe}%`)
      .order("sale_date", { ascending: false })
      .limit(5),
  ]);

  for (const [label, result] of [
    ["products", products],
    ["parties", parties],
    ["sales", sales],
  ] as const) {
    if (result.error) {
      console.error("[search]", label, result.error.code, result.error.message);
    }
  }

  const hits: SearchHit[] = [];

  for (const p of products.data ?? []) {
    hits.push({
      id: p.id,
      label: p.name,
      detail: p.sku,
      href: `/inventory/products/${p.id}`,
      group: "Products",
    });
  }

  for (const p of parties.data ?? []) {
    const isSupplier = p.type === "supplier";
    hits.push({
      id: p.id,
      label: p.name,
      detail: p.phone,
      href: `${isSupplier ? "/suppliers" : "/customers"}/${p.id}`,
      group: isSupplier ? "Suppliers" : "Customers",
    });
  }

  for (const s of sales.data ?? []) {
    hits.push({
      id: s.id,
      label: s.invoice_number ?? "Sale",
      detail: null,
      href: `/sales/${s.id}`,
      group: "Invoices",
    });
  }

  return hits;
}
