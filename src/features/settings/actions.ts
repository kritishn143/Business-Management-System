"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "./queries";
import {
  businessProfileSchema,
  localizationFormSchema,
  memberRoleSchema,
  memberStatusSchema,
} from "./schemas";

export type SettingsFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * RLS is the real boundary; this only turns a refusal into something a
 * shopkeeper can act on (SPEC §44, §61).
 */
function humanDbError(
  error: { code?: string; message?: string },
  context: string,
): string {
  if (error.code === "42501") {
    return "You don't have permission to change this.";
  }
  if (error.code === "23505") {
    return "Those details clash with another business on your account.";
  }
  if (error.code === "23514") {
    return "Some of those values are out of range. Please check and try again.";
  }
  console.error(`[settings] ${context}`, error.code, error.message);
  return "We couldn't save that. Please try again.";
}

/** Revalidates the layout too: the shop name and currency live in the chrome. */
function revalidateShop() {
  revalidatePath("/", "layout");
  revalidatePath("/settings/business");
  revalidatePath("/settings/localization");
}

export async function updateBusinessProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = businessProfileSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
    category: formData.get("category"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    registrationNumber: formData.get("registrationNumber") ?? "",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const { business, role } = await loadSettings();
  if (role !== "owner") {
    return { error: "Only an owner can change your business details." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("businesses")
    .update(
      {
        name: parsed.data.name,
        business_type: parsed.data.businessType,
        category: parsed.data.category,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: parsed.data.address,
        registration_number: parsed.data.registrationNumber,
      },
      { count: "exact" },
    )
    .eq("id", business.id);

  if (error) return { error: humanDbError(error, "profile") };
  // RLS filters rows out rather than raising, so nothing changed means refused.
  if (count === 0) return { error: "Only an owner can change your business details." };

  revalidateShop();
  return { success: "Business details saved." };
}

export async function updateLocalizationAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = localizationFormSchema.safeParse({
    currencyCode: formData.get("currencyCode"),
    currencyPosition: formData.get("currencyPosition"),
    numberFormat: formData.get("numberFormat"),
    timezone: formData.get("timezone"),
    dateSystem: formData.get("dateSystem"),
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
    fiscalYearStartDay: formData.get("fiscalYearStartDay"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const { business, role } = await loadSettings();
  if (role !== "owner") {
    return { error: "Only an owner can change these settings." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("businesses")
    .update(
      {
        currency_code: parsed.data.currencyCode,
        currency_position: parsed.data.currencyPosition,
        number_format: parsed.data.numberFormat,
        timezone: parsed.data.timezone,
        date_system: parsed.data.dateSystem,
        fiscal_year_start_month: parsed.data.fiscalYearStartMonth,
        fiscal_year_start_day: parsed.data.fiscalYearStartDay,
      },
      { count: "exact" },
    )
    .eq("id", business.id);

  if (error) return { error: humanDbError(error, "localization") };
  if (count === 0) return { error: "Only an owner can change these settings." };

  revalidateShop();
  return {
    success:
      "Saved. Amounts and dates across the app now follow these settings — past transactions are unchanged.",
  };
}

export async function updateMemberRoleAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = memberRoleSchema.safeParse({
    memberId: formData.get("memberId"),
    role: formData.get("role"),
  });

  if (!parsed.success) return { error: "That role isn't one we recognise." };

  const { business } = await loadSettings();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("business_members")
    .update({ role: parsed.data.role }, { count: "exact" })
    .eq("id", parsed.data.memberId)
    .eq("business_id", business.id);

  if (error) {
    // The owner-role trigger and the last-owner guard both raise here.
    if (error.message?.includes("ownership")) {
      return { error: "Only an owner can grant or withdraw ownership." };
    }
    if (error.message?.includes("at least one active owner")) {
      return { error: "Make someone else an owner first — a shop needs one." };
    }
    return { error: humanDbError(error, "role") };
  }
  if (count === 0) return { error: "You don't have permission to change roles." };

  revalidatePath("/settings/users");
  return { success: "Role updated." };
}

export async function updateMemberStatusAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = memberStatusSchema.safeParse({
    memberId: formData.get("memberId"),
    status: formData.get("status"),
  });

  if (!parsed.success) return { error: "We couldn't work out what to change." };

  const { business } = await loadSettings();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("business_members")
    .update({ status: parsed.data.status }, { count: "exact" })
    .eq("id", parsed.data.memberId)
    .eq("business_id", business.id);

  if (error) {
    if (error.message?.includes("at least one active owner")) {
      return { error: "A shop must keep one active owner." };
    }
    if (error.message?.includes("ownership")) {
      return { error: "Only an owner can suspend another owner." };
    }
    return { error: humanDbError(error, "status") };
  }
  if (count === 0) return { error: "You don't have permission to change access." };

  revalidatePath("/settings/users");
  return {
    success:
      parsed.data.status === "suspended" ? "Access suspended." : "Access restored.",
  };
}
