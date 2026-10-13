"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adjustStockSchema } from "./schemas";

export type AdjustStockState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

export async function adjustStockAction(
  _prev: AdjustStockState,
  formData: FormData,
): Promise<AdjustStockState> {
  const parsed = adjustStockSchema.safeParse({
    productId: formData.get("productId"),
    direction: formData.get("direction"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { productId, direction, quantity, reason, notes } = parsed.data;
  const signed = direction === "decrease" ? -quantity : quantity;

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_quantity: signed,
    p_reason: reason,
    p_notes: notes,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to adjust stock." };
    }
    // The RPC raises readable messages for its own validation failures.
    if (error.code === "23514" || error.message?.includes("must reduce stock")) {
      return { error: error.message };
    }
    console.error("[inventory] adjust", error.code, error.message);
    return { error: "We couldn't record that adjustment. Please try again." };
  }

  revalidatePath(`/inventory/products/${productId}`);
  revalidatePath("/inventory");

  return { success: "Stock adjusted." };
}
