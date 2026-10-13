"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const lineSchema = z.object({
  productId: z.string().uuid(),
  unitId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lineDiscount: z.number().nonnegative(),
});

const saleSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item before taking payment."),
  customerId: z.string().uuid().nullable(),
  discount: z.number().nonnegative(),
  additionalCharge: z.number().nonnegative(),
  roundOff: z.number(),
  method: z.enum(["cash", "bank", "qr", "card", "wallet", "credit", "other"]),
  paid: z.number().nonnegative(),
  notes: z.string().trim().max(500).nullable(),
  /** Generated client-side so a retry cannot duplicate the sale (SPEC §52). */
  clientTransactionId: z.string().min(8).max(64),
});

export type CompleteSaleResult =
  | { ok: true; saleId: string; invoiceNumber: string }
  | { ok: false; error: string };

export async function completeSaleAction(
  input: unknown,
): Promise<CompleteSaleResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That sale isn't valid." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("complete_sale", {
    p_items: v.lines.map((l) => ({
      product_id: l.productId,
      unit_id: l.unitId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_amount: l.lineDiscount,
    })),
    p_payments:
      v.paid > 0 ? [{ method: v.method, amount: v.paid }] : [],
    p_customer_id: v.customerId,
    p_discount: v.discount,
    p_additional_charge: v.additionalCharge,
    p_round_off: v.roundOff,
    p_notes: v.notes,
    p_location_id: null,
    p_client_transaction_id: v.clientTransactionId,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "You don't have permission to record sales." };
    }
    // The RPC raises readable messages for its own validation failures.
    if (error.code === "23514" || error.message?.startsWith("A ") || error.message?.startsWith("Choose")) {
      return { ok: false, error: error.message };
    }
    console.error("[sales] complete", error.code, error.message);
    return { ok: false, error: "We couldn't complete that sale. Nothing was saved." };
  }

  const sale = data as { id: string; invoice_number: string };

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return { ok: true, saleId: sale.id, invoiceNumber: sale.invoice_number };
}

export type PosCustomer = { id: string; name: string; phone: string | null };

/** Customers available for a credit sale. */
export async function listPosCustomers(): Promise<PosCustomer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parties")
    .select("id, name, phone")
    .in("type", ["customer", "both"])
    .eq("is_active", true)
    .order("name")
    .limit(500);

  if (error) {
    console.error("[sales] customers", error.code, error.message);
    return [];
  }
  return (data ?? []) as PosCustomer[];
}

export type PosProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: string;
  base_unit_id: string;
  unit_symbol: string;
  quantity: number;
  track_inventory: boolean;
};

/** Fast product lookup for the counter (SPEC §49). */
export async function searchPosProducts(term: string): Promise<PosProduct[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(`
      id, name, sku, barcode, selling_price, base_unit_id, track_inventory,
      base_unit:units!products_base_unit_same_business (symbol),
      balances:inventory_balances (quantity)
    `)
    .eq("is_active", true)
    .limit(20);

  const safe = term.trim().replace(/[(),*]/g, " ").trim();
  if (safe) {
    query = query.or(`name.ilike.*${safe}*,sku.ilike.*${safe}*,barcode.eq.${safe}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[sales] search", error.code, error.message);
    return [];
  }

  return (data ?? []).map((p) => {
    const row = p as unknown as {
      id: string;
      name: string;
      sku: string | null;
      barcode: string | null;
      selling_price: string;
      base_unit_id: string;
      track_inventory: boolean;
      base_unit: { symbol: string } | null;
      balances: { quantity: string }[];
    };
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      selling_price: row.selling_price,
      base_unit_id: row.base_unit_id,
      unit_symbol: row.base_unit?.symbol ?? "",
      quantity: Number(row.balances?.[0]?.quantity ?? 0),
      track_inventory: row.track_inventory,
    };
  });
}

/**
 * The whole sellable catalogue, for the counter to keep a local copy of so it
 * can go on selling without a connection (SPEC §50). Capped: a shop with more
 * products than this needs a different strategy than "hold it all".
 */
export async function listCatalogueForCache(): Promise<PosProduct[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, sku, barcode, selling_price, base_unit_id, track_inventory,
      base_unit:units!products_base_unit_same_business (symbol),
      balances:inventory_balances (quantity)
    `)
    .eq("is_active", true)
    .order("name")
    .limit(2000);

  if (error) {
    console.error("[sales] catalogue", error.code, error.message);
    return [];
  }

  return (data ?? []).map((p) => {
    const row = p as unknown as {
      id: string;
      name: string;
      sku: string | null;
      barcode: string | null;
      selling_price: string;
      base_unit_id: string;
      track_inventory: boolean;
      base_unit: { symbol: string } | null;
      balances: { quantity: string }[];
    };
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      selling_price: row.selling_price,
      base_unit_id: row.base_unit_id,
      unit_symbol: row.base_unit?.symbol ?? "",
      quantity: Number(row.balances?.[0]?.quantity ?? 0),
      track_inventory: row.track_inventory,
    };
  });
}
