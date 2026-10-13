"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type MoneyFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const amount = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50")
  .transform(Number)
  .refine((v) => v > 0, "Enter an amount greater than zero");

const entrySchema = z.object({
  kind: z.enum(["expense", "income"]),
  amount,
  categoryId: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
  accountId: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
  entryDate: z
    .string()
    .trim()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date"),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
});

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

async function currentBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.business_id ?? null;
}

export async function recordMoneyEntryAction(
  _prev: MoneyFormState,
  formData: FormData,
): Promise<MoneyFormState> {
  const parsed = entrySchema.safeParse({
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    accountId: formData.get("accountId"),
    entryDate: formData.get("entryDate"),
    description: formData.get("description"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const v = parsed.data;
  const supabase = await createClient();
  const businessId = await currentBusinessId(supabase);
  if (!businessId) return { error: "We couldn't work out which shop this is for." };

  const table = v.kind === "expense" ? "expenses" : "income_entries";
  const dateColumn = v.kind === "expense" ? "expense_date" : "income_date";

  const { error } = await supabase.from(table).insert({
    business_id: businessId,
    category_id: v.categoryId,
    account_id: v.accountId,
    amount: v.amount,
    [dateColumn]: v.entryDate,
    description: v.description,
  });

  if (error) {
    if (error.code === "42501") {
      return {
        error: `You don't have permission to record ${v.kind === "expense" ? "expenses" : "income"}.`,
      };
    }
    console.error("[money] record", error.code, error.message);
    return { error: "We couldn't save that. Please try again." };
  }

  revalidatePath("/accounts");
  revalidatePath(v.kind === "expense" ? "/expenses" : "/income");
  return { success: v.kind === "expense" ? "Expense recorded." : "Income recorded." };
}

/**
 * Editing an entry rather than reversing it: an expense is a record of what was
 * spent, not a posted transaction with stock or a customer behind it, so
 * correcting a typo is the honest fix. The audit trail keeps the before and
 * after, and a closed financial year refuses the change (SPEC §25, §40).
 */
export async function updateMoneyEntryAction(
  _prev: MoneyFormState,
  formData: FormData,
): Promise<MoneyFormState> {
  const id = z.string().uuid().safeParse(formData.get("entryId"));
  if (!id.success) return { error: "We couldn't work out which record to change." };

  const parsed = entrySchema.safeParse({
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    accountId: formData.get("accountId"),
    entryDate: formData.get("entryDate"),
    description: formData.get("description"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const v = parsed.data;
  const supabase = await createClient();

  const table = v.kind === "expense" ? "expenses" : "income_entries";
  const dateColumn = v.kind === "expense" ? "expense_date" : "income_date";

  const { error, count } = await supabase
    .from(table)
    .update(
      {
        category_id: v.categoryId,
        account_id: v.accountId,
        amount: v.amount,
        [dateColumn]: v.entryDate,
        description: v.description,
      },
      { count: "exact" },
    )
    .eq("id", id.data);

  if (error) return { error: humanMoneyError(error, "update") };
  // RLS refuses by filtering rather than raising.
  if (count === 0) {
    return { error: "You don't have permission to change this record." };
  }

  revalidatePath("/accounts");
  revalidatePath(v.kind === "expense" ? "/expenses" : "/income");
  return { success: "Saved." };
}

export async function deleteMoneyEntryAction(
  _prev: MoneyFormState,
  formData: FormData,
): Promise<MoneyFormState> {
  const id = z.string().uuid().safeParse(formData.get("entryId"));
  if (!id.success) return { error: "We couldn't work out which record to remove." };

  const kind = formData.get("kind") === "income" ? "income" : "expense";
  const supabase = await createClient();
  const table = kind === "expense" ? "expenses" : "income_entries";

  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq("id", id.data);

  if (error) return { error: humanMoneyError(error, "delete") };
  if (count === 0) {
    return { error: "You don't have permission to remove this record." };
  }

  revalidatePath("/accounts");
  revalidatePath(kind === "expense" ? "/expenses" : "/income");
  return { success: "Removed." };
}

/** The database raises wording meant for a shopkeeper; pass it through. */
function humanMoneyError(
  error: { code?: string; message?: string },
  context: string,
): string {
  if (error.code === "42501") return "You don't have permission to do that.";
  // The closed-period guard raises its own explanation.
  if (error.message?.includes("closed financial year")) return error.message;
  if (error.code === "23503") {
    return "Something still refers to this record, so it cannot be removed.";
  }
  console.error(`[money] ${context}`, error.code, error.message);
  return "We couldn't do that. Please try again.";
}
