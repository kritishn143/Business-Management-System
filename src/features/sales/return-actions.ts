"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const returnSchema = z.object({
  saleId: z.string().uuid(),
  items: z
    .array(z.object({ saleItemId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1, "Choose at least one item to return."),
  reason: z.string().trim().max(200).nullable(),
  clientTransactionId: z.string().min(8).max(64),
});

export type ReturnResult =
  | { ok: true; returnNumber: string }
  | { ok: false; error: string };

export async function createSaleReturnAction(input: unknown): Promise<ReturnResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That return isn't valid." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_sale_return", {
    p_sale_id: v.saleId,
    p_items: v.items.map((i) => ({
      sale_item_id: i.saleItemId,
      quantity: i.quantity,
    })),
    p_refund_amount: null,
    p_reason: v.reason,
    p_notes: null,
    p_client_transaction_id: v.clientTransactionId,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "You don't have permission to accept returns." };
    }
    // The RPC raises readable messages, including the remaining-quantity one.
    if (error.code === "23514" || /^(Only|Enter|Choose|You cannot)/.test(error.message ?? "")) {
      return { ok: false, error: error.message };
    }
    console.error("[sales] return", error.code, error.message);
    return { ok: false, error: "We couldn't record that return. Nothing was changed." };
  }

  const result = data as { return_number: string };

  revalidatePath("/sales");
  revalidatePath(`/sales/${v.saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return { ok: true, returnNumber: result.return_number };
}
