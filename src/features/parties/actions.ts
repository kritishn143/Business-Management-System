"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PartyFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const amount = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v : "0"))
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 250 or 250.50")
  .transform(Number);

const partySchema = z.object({
  kind: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1, "Give the contact a name.").max(160),
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
  email: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: "That doesn't look like a valid email address.",
    }),
  address: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
  openingBalance: amount,
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

export async function createPartyAction(
  _prev: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const parsed = partySchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    openingBalance: formData.get("openingBalance"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const v = parsed.data;
  const supabase = await createClient();
  const businessId = await currentBusinessId(supabase);
  if (!businessId) return { error: "We couldn't work out which shop this is for." };

  // A supplier's opening figure is what we owe them, so it is stored negative.
  const opening =
    v.kind === "supplier" && v.openingBalance > 0
      ? -v.openingBalance
      : v.openingBalance;

  const { error } = await supabase.from("parties").insert({
    business_id: businessId,
    type: v.kind,
    name: v.name,
    phone: v.phone,
    email: v.email,
    address: v.address,
    opening_balance: opening,
  });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { phone: "Another contact already uses that phone number." } };
    }
    if (error.code === "42501") {
      return { error: "You don't have permission to add contacts." };
    }
    console.error("[parties] create", error.code, error.message);
    return { error: "We couldn't save that contact. Please try again." };
  }

  revalidatePath(v.kind === "customer" ? "/customers" : "/suppliers");
  return { success: `Added ${v.name}.` };
}

const paymentSchema = z.object({
  partyId: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  amount: amount.refine((v) => v > 0, "Enter an amount greater than zero"),
  method: z.enum(["cash", "bank", "qr", "card", "wallet", "other"]),
  notes: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
});

export async function recordPaymentAction(
  _prev: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const parsed = paymentSchema.safeParse({
    partyId: formData.get("partyId"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const v = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.rpc("record_party_payment", {
    p_party_id: v.partyId,
    p_amount: v.amount,
    p_direction: v.direction,
    p_method: v.method,
    p_notes: v.notes,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to record payments." };
    }
    if (error.code === "23514" || error.message?.startsWith("Enter")) {
      return { error: error.message };
    }
    console.error("[parties] payment", error.code, error.message);
    return { error: "We couldn't record that payment. Please try again." };
  }

  revalidatePath("/customers");
  revalidatePath("/suppliers");
  return { success: "Payment recorded." };
}
