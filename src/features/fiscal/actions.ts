"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FiscalActionState = { error?: string; success?: string };

const idSchema = z.string().uuid();

/** The RPCs raise readable messages for their own rules; pass those through. */
function humanError(
  error: { code?: string; message?: string },
  context: string,
): string {
  if (error.code === "42501") {
    return error.message?.startsWith("Only") || error.message?.startsWith("You do not")
      ? error.message
      : "You don't have permission to do that.";
  }
  if (error.code === "check_violation" || error.code === "23514") {
    return error.message ?? "That isn't allowed yet.";
  }
  if (error.message) return error.message;
  console.error(`[fiscal] ${context}`, error.code);
  return "We couldn't do that. Please try again.";
}

export async function closeFiscalYearAction(
  _prev: FiscalActionState,
  formData: FormData,
): Promise<FiscalActionState> {
  const parsed = idSchema.safeParse(formData.get("fiscalYearId"));
  if (!parsed.success) return { error: "We couldn't work out which year to close." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_fiscal_year", {
    p_fiscal_year_id: parsed.data,
  });

  if (error) return { error: humanError(error, "close") };

  revalidatePath("/settings/fiscal-years");
  return {
    success:
      "Year closed. Its transactions are preserved and its closing position recorded.",
  };
}

export async function reopenFiscalYearAction(
  _prev: FiscalActionState,
  formData: FormData,
): Promise<FiscalActionState> {
  const parsed = idSchema.safeParse(formData.get("fiscalYearId"));
  if (!parsed.success) return { error: "We couldn't work out which year to reopen." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_fiscal_year", {
    p_fiscal_year_id: parsed.data,
  });

  if (error) return { error: humanError(error, "reopen") };

  revalidatePath("/settings/fiscal-years");
  return { success: "Year reopened. It can be edited again." };
}
