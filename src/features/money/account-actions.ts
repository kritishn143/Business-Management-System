"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadActiveBusiness } from "@/features/businesses/queries";

export type AccountFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

/** A balance may be negative; an amount to move may not. */
const signedAmount = z
  .string()
  .trim()
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50")
  .transform(Number);

const positiveAmount = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50")
  .transform(Number)
  .refine((v) => v > 0, "Enter an amount greater than zero");

const accountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the account a name, like Cash or NIC Asia.")
    .max(80, "That name is too long."),
  type: z.enum(["cash", "bank", "wallet", "other"]),
  openingBalance: signedAmount,
});

const transferSchema = z.object({
  fromAccount: z.string().uuid("Choose the account the money is leaving."),
  toAccount: z.string().uuid("Choose the account it is going to."),
  amount: positiveAmount,
  movedOn: z.string().trim().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date"),
  note: z.string().trim().max(200).transform((v) => (v.length > 0 ? v : null)).nullable(),
});

const adjustSchema = z.object({
  accountId: z.string().uuid(),
  counted: signedAmount,
  note: z.string().trim().max(200).transform((v) => (v.length > 0 ? v : null)).nullable(),
});

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

function refresh(accountId?: string) {
  revalidatePath("/accounts");
  revalidatePath("/accounts");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

/** The RPCs raise wording meant for a shopkeeper; pass it through. */
function humanError(error: { code?: string; message?: string }, context: string) {
  if (error.code === "42501") {
    return error.message?.startsWith("You do not")
      ? error.message
      : "You don't have permission to do that.";
  }
  if (error.code === "23505") return "You already have an account with that name.";
  if (error.code === "23514" || error.code === "check_violation") {
    return error.message ?? "That isn't allowed.";
  }
  if (error.message) return error.message;
  console.error(`[accounts] ${context}`, error.code);
  return "We couldn't do that. Please try again.";
}

export async function createAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    openingBalance: formData.get("openingBalance") ?? "0",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const { business } = await loadActiveBusiness();
  const supabase = await createClient();

  const { error } = await supabase.from("accounts").insert({
    business_id: business.id,
    name: parsed.data.name,
    type: parsed.data.type,
    opening_balance: parsed.data.openingBalance,
  });

  if (error) return { error: humanError(error, "create") };

  refresh();
  return { success: `${parsed.data.name} added.` };
}

export async function renameAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const id = z.string().uuid().safeParse(formData.get("accountId"));
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    openingBalance: formData.get("openingBalance") ?? "0",
  });

  if (!id.success) return { error: "We couldn't work out which account to change." };
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update(
      {
        name: parsed.data.name,
        type: parsed.data.type,
        opening_balance: parsed.data.openingBalance,
      },
      { count: "exact" },
    )
    .eq("id", id.data);

  if (error) return { error: humanError(error, "rename") };
  if (count === 0) return { error: "You don't have permission to change this account." };

  refresh(id.data);
  return { success: "Account updated." };
}

/** Kept, not deleted: its history is part of the books (SPEC §69). */
export async function setAccountActiveAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const id = z.string().uuid().safeParse(formData.get("accountId"));
  if (!id.success) return { error: "We couldn't work out which account to change." };

  const active = formData.get("isActive") === "true";
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("accounts")
    .update({ is_active: active }, { count: "exact" })
    .eq("id", id.data);

  if (error) return { error: humanError(error, "archive") };
  if (count === 0) return { error: "You don't have permission to change this account." };

  refresh(id.data);
  return { success: active ? "Account reopened." : "Account closed to new entries." };
}

export async function transferAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = transferSchema.safeParse({
    fromAccount: formData.get("fromAccount"),
    toAccount: formData.get("toAccount"),
    amount: formData.get("amount"),
    movedOn: formData.get("movedOn"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  if (parsed.data.fromAccount === parsed.data.toAccount) {
    return { fieldErrors: { toAccount: "Choose a different account." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_between_accounts", {
    p_from_account: parsed.data.fromAccount,
    p_to_account: parsed.data.toAccount,
    p_amount: parsed.data.amount,
    p_moved_on: parsed.data.movedOn,
    p_note: parsed.data.note,
  });

  if (error) return { error: humanError(error, "transfer") };

  refresh(parsed.data.fromAccount);
  revalidatePath(`/accounts/${parsed.data.toAccount}`);
  return { success: "Money moved." };
}

export async function adjustBalanceAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = adjustSchema.safeParse({
    accountId: formData.get("accountId"),
    counted: formData.get("counted"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_account_balance", {
    p_account: parsed.data.accountId,
    p_counted: parsed.data.counted,
    p_note: parsed.data.note,
  });

  if (error) return { error: humanError(error, "adjust") };

  refresh(parsed.data.accountId);
  const delta = Number(data ?? 0);
  return {
    success:
      delta > 0
        ? `Balance corrected up by ${delta.toFixed(2)}.`
        : `Balance corrected down by ${Math.abs(delta).toFixed(2)}.`,
  };
}

/**
 * Takes an entry back, or puts it back. The entry itself is never changed —
 * only whether it counts — so the history shows both what was done and what
 * was taken back (SPEC §69).
 */
export async function undoMovementAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const id = z.string().uuid().safeParse(formData.get("movementId"));
  if (!id.success) return { error: "We couldn't work out which entry to change." };

  const undone = formData.get("undone") === "true";
  const accountId = String(formData.get("accountId") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_movement_undone", {
    p_movement: id.data,
    p_undone: undone,
  });

  if (error) return { error: humanError(error, "undo") };

  refresh(accountId || undefined);
  const both = Number(data ?? 0) > 1;
  return {
    success: undone
      ? both
        ? "Transfer taken back from both accounts."
        : "Entry taken back."
      : both
        ? "Transfer put back in both accounts."
        : "Entry put back.",
  };
}

/** Putting money in or taking it out by an amount, rather than to a total. */
export async function changeBalanceAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = z
    .object({
      accountId: z.string().uuid(),
      amount: positiveAmount,
      direction: z.enum(["in", "out"]),
      note: z.string().trim().max(200).transform((v) => (v.length > 0 ? v : null)).nullable(),
      movedOn: z.string().trim().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date"),
    })
    .safeParse({
      accountId: formData.get("accountId"),
      amount: formData.get("amount"),
      direction: formData.get("direction"),
      note: formData.get("note") ?? "",
      movedOn: formData.get("movedOn"),
    });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_account_change", {
    p_account: parsed.data.accountId,
    p_amount: parsed.data.amount,
    p_direction: parsed.data.direction,
    p_note: parsed.data.note,
    p_moved_on: parsed.data.movedOn,
  });

  if (error) return { error: humanError(error, "change") };

  refresh(parsed.data.accountId);
  return {
    success: parsed.data.direction === "in" ? "Money added." : "Money taken out.",
  };
}

/**
 * Removes an account entirely. Only possible while nothing has moved through
 * it — once it has history, that history is part of the books, so the account
 * is closed instead (SPEC §69).
 */
export async function deleteAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const id = z.string().uuid().safeParse(formData.get("accountId"));
  if (!id.success) return { error: "We couldn't work out which account to remove." };

  const supabase = await createClient();

  const { data: ledger, error: ledgerError } = await supabase.rpc("account_ledger", {
    target_account: id.data,
  });

  if (ledgerError) return { error: humanError(ledgerError, "delete") };

  if ((ledger ?? []).length > 0) {
    return {
      error:
        "This account has entries against it, so it cannot be removed. Close it instead — its history stays part of your books.",
    };
  }

  const { error, count } = await supabase
    .from("accounts")
    .delete({ count: "exact" })
    .eq("id", id.data);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "Something still refers to this account, so it cannot be removed.",
      };
    }
    return { error: humanError(error, "delete") };
  }
  if (count === 0) return { error: "You don't have permission to remove this account." };

  refresh();
  return { success: "Account removed." };
}
