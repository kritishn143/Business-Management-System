import { createClient } from "@/lib/supabase/server";
import { orderByActive, readActiveBusinessId } from "./active";
import type { Business, MemberRole } from "@/types/database";

/**
 * Everything the chrome and the formatters need, and nothing more. The shop's
 * own localisation settings travel with it, so currency and calendar are never
 * re-guessed page by page.
 */
export type MembershipSummary = {
  business: Pick<
    Business,
    | "id"
    | "name"
    | "slug"
    | "currency_code"
    | "currency_position"
    | "number_format"
    | "date_format"
    | "timezone"
    | "date_system"
  >;
  role: MemberRole;
};

/**
 * Businesses the signed-in user actually belongs to, with the one they are
 * working in first. RLS does the filtering, so a cookie naming a business the
 * user does not belong to simply matches nothing and the earliest membership
 * stays active (SPEC §44).
 */
export async function listMemberships(): Promise<MembershipSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_members")
    .select(
      "role, businesses:business_id (id, name, slug, currency_code, currency_position, number_format, date_format, timezone, date_system)",
    )
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[businesses] listMemberships", error.code, error.message);
    throw new Error("We couldn't load your businesses.");
  }

  const memberships = (data ?? []).flatMap((row) => {
    const business = row.businesses as unknown as MembershipSummary["business"] | null;
    return business ? [{ business, role: row.role as MemberRole }] : [];
  });

  // Everything downstream treats the first membership as the active one, so
  // the choice is applied in exactly one place.
  return orderByActive(memberships, await readActiveBusinessId());
}

/** The full profile of the shop, for screens that print or configure it. */
export type BusinessProfile = Pick<
  Business,
  | "id"
  | "name"
  | "slug"
  | "category"
  | "business_type"
  | "phone"
  | "email"
  | "address"
  | "registration_number"
  | "currency_code"
  | "currency_position"
  | "number_format"
  | "date_format"
  | "timezone"
  | "date_system"
  | "fiscal_year_start_month"
  | "fiscal_year_start_day"
  | "created_at"
>;

/**
 * The shop the app is working in, with the fields invoices and settings need.
 * Until a switcher persists a choice this is the earliest membership, which is
 * what the rest of the app treats as active.
 */
export async function loadActiveBusiness(): Promise<{
  business: BusinessProfile;
  role: MemberRole;
}> {
  const memberships = await listMemberships();
  const active = memberships[0];
  if (!active) throw new Error("You don't belong to a business yet.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, category, business_type, phone, email, address, registration_number, currency_code, currency_position, number_format, date_format, timezone, date_system, fiscal_year_start_month, fiscal_year_start_day, created_at",
    )
    .eq("id", active.business.id)
    .single();

  if (error || !data) {
    console.error("[businesses] loadActiveBusiness", error?.code, error?.message);
    throw new Error("We couldn't load your business.");
  }

  return { business: data as BusinessProfile, role: active.role };
}
