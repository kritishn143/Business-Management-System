"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productSchema } from "./schemas";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function humanDbError(error: { code?: string; message?: string }): string {
  // 23505 is a unique violation; the constraint name says which field.
  if (error.code === "23505") {
    if (error.message?.includes("products_sku_key")) {
      return "That SKU is already used by another product.";
    }
    if (error.message?.includes("products_barcode_key")) {
      return "That barcode is already used by another product.";
    }
    return "A product with those details already exists.";
  }
  if (error.code === "42501") {
    return "You don't have permission to add products.";
  }
  console.error("[products] create", error.code, error.message);
  return "We couldn't save this product. Please try again.";
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    categoryId: formData.get("categoryId"),
    baseUnitId: formData.get("baseUnitId"),
    purchasePrice: formData.get("purchasePrice"),
    sellingPrice: formData.get("sellingPrice"),
    minimumStock: formData.get("minimumStock"),
    openingStock: formData.get("openingStock"),
    trackInventory: formData.get("trackInventory") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const input = parsed.data;
  const supabase = await createClient();

  // business_id is filled by RLS-visible context: we look it up from the unit
  // the user picked, which RLS already restricts to their own business.
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("business_id")
    .eq("id", input.baseUnitId)
    .single();

  if (unitError || !unit) {
    return { fieldErrors: { baseUnitId: "That unit is no longer available." } };
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      business_id: unit.business_id,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      category_id: input.categoryId,
      base_unit_id: input.baseUnitId,
      purchase_price: input.purchasePrice,
      selling_price: input.sellingPrice,
      minimum_stock: input.minimumStock,
      track_inventory: input.trackInventory,
    })
    .select("id")
    .single();

  if (error) return { error: humanDbError(error) };

  // Opening stock is a ledger entry, never a column write (SPEC §11).
  if (input.openingStock > 0) {
    const { error: stockError } = await supabase.rpc("adjust_stock", {
      p_product_id: product.id,
      p_quantity: input.openingStock,
      p_reason: "opening_stock",
      p_unit_cost: input.purchasePrice > 0 ? input.purchasePrice : null,
      p_notes: "Opening stock recorded when the product was created",
    });

    if (stockError) {
      // The product exists and is usable; only the stock entry failed.
      console.error("[products] opening stock", stockError.code, stockError.message);
      return {
        error:
          "The product was saved, but we couldn't record its opening stock. Add it from the product page.",
      };
    }
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}
