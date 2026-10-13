"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const lineSchema = z.object({
  productId: z.string().uuid(),
  unitId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const purchaseSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item to the bill."),
  supplierId: z.string().uuid().nullable(),
  paidAmount: z.number().nonnegative(),
  supplierInvoice: z.string().trim().max(60).nullable(),
  clientTransactionId: z.string().min(8).max(64),
});

export type CompletePurchaseResult =
  | { ok: true; purchaseId: string; invoiceNumber: string }
  | { ok: false; error: string };

export async function completePurchaseAction(
  input: unknown,
): Promise<CompletePurchaseResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That bill isn't valid." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("complete_purchase", {
    p_items: v.lines.map((l) => ({
      product_id: l.productId,
      unit_id: l.unitId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
    })),
    p_supplier_id: v.supplierId,
    p_paid_amount: v.paidAmount,
    p_supplier_invoice: v.supplierInvoice,
    p_discount: 0,
    p_additional_charge: 0,
    p_round_off: 0,
    p_notes: null,
    p_location_id: null,
    p_client_transaction_id: v.clientTransactionId,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "You don't have permission to record purchases." };
    }
    if (error.code === "23514" || error.message?.startsWith("Choose") || error.message?.startsWith("You cannot")) {
      return { ok: false, error: error.message };
    }
    console.error("[purchases] complete", error.code, error.message);
    return { ok: false, error: "We couldn't record that bill. Nothing was saved." };
  }

  const purchase = data as { id: string; invoice_number: string };

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/suppliers");

  return { ok: true, purchaseId: purchase.id, invoiceNumber: purchase.invoice_number };
}

export type PurchaseProduct = {
  id: string;
  name: string;
  sku: string | null;
  purchase_price: string;
  base_unit_id: string;
  unit_symbol: string;
};

export async function searchPurchaseProducts(term: string): Promise<PurchaseProduct[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(`
      id, name, sku, purchase_price, base_unit_id,
      base_unit:units!products_base_unit_same_business (symbol)
    `)
    .eq("is_active", true)
    .limit(20);

  const safe = term.trim().replace(/[(),*]/g, " ").trim();
  if (safe) {
    query = query.or(`name.ilike.*${safe}*,sku.ilike.*${safe}*,barcode.eq.${safe}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[purchases] search", error.code, error.message);
    return [];
  }

  return (data ?? []).map((p) => {
    const row = p as unknown as {
      id: string;
      name: string;
      sku: string | null;
      purchase_price: string;
      base_unit_id: string;
      base_unit: { symbol: string } | null;
    };
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      purchase_price: row.purchase_price,
      base_unit_id: row.base_unit_id,
      unit_symbol: row.base_unit?.symbol ?? "",
    };
  });
}

export async function listSuppliers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parties")
    .select("id, name")
    .in("type", ["supplier", "both"])
    .eq("is_active", true)
    .order("name")
    .limit(500);

  if (error) {
    console.error("[purchases] suppliers", error.code, error.message);
    return [];
  }
  return data ?? [];
}
