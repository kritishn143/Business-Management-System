"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeActiveBusinessId } from "./active";
import { createBusinessSchema } from "./schemas";

export type BusinessFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Postgres codes worth translating for this form (SPEC §61). */
function humanDbError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") {
    return "A business with that name already exists on your account.";
  }
  if (error.code === "28000" || error.code === "42501") {
    return "Your session has expired. Sign in again to continue.";
  }
  console.error("[businesses] create", error.code, error.message);
  return "We couldn't create your business. Please try again.";
}

export async function createBusinessAction(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
    category: formData.get("category"),
    currencyCode: formData.get("currencyCode"),
    timezone: formData.get("timezone"),
    dateSystem: formData.get("dateSystem"),
    locationName: formData.get("locationName") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();

  // One RPC, one transaction: business + owner membership + default location
  // + starter units, or nothing at all (SPEC §43).
  const { data, error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
    p_category: parsed.data.category,
    p_currency_code: parsed.data.currencyCode,
    p_timezone: parsed.data.timezone,
    p_date_system: parsed.data.dateSystem,
    p_location_name: parsed.data.locationName,
  });

  if (error) return { error: humanDbError(error) };

  // Land in the shop that was just created, not whichever was active before.
  const created = data as { id?: string } | null;
  if (created?.id) await writeActiveBusinessId(created.id);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Switches which business the user is working in. The cookie is a preference;
 * this refuses to set it unless the database agrees they are a member.
 */
export async function switchBusinessAction(formData: FormData): Promise<void> {
  const parsed = z.string().uuid().safeParse(formData.get("businessId"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("business_id", parsed.data)
    .eq("status", "active")
    .maybeSingle();

  // RLS already limits this to the signed-in user's own memberships.
  if (!data) return;

  await writeActiveBusinessId(data.business_id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
