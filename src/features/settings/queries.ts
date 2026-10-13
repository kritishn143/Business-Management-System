import { createClient } from "@/lib/supabase/server";
import {
  loadActiveBusiness,
  type BusinessProfile,
} from "@/features/businesses/queries";
import type { MemberRole, MemberStatus } from "@/types/database";

export type BusinessSettings = BusinessProfile;

export type SettingsContext = {
  business: BusinessSettings;
  /** The signed-in user's role in this business, for gating the forms. */
  role: MemberRole;
};

/** The shop being configured. */
export async function loadSettings(): Promise<SettingsContext> {
  return loadActiveBusiness();
}

export type StaffMember = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string | null;
  isYou: boolean;
};

/**
 * Everyone with access to the shop. Names come from profiles, which co-members
 * are allowed to read (SPEC §26); emails live in auth.users and stay there.
 */
export async function listStaff(businessId: string): Promise<StaffMember[]> {
  const supabase = await createClient();

  const [{ data: user }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("business_members")
      .select("id, user_id, role, status, joined_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
  ]);

  if (error) {
    console.error("[settings] staff", error.code, error.message);
    throw new Error("We couldn't load the people in this shop.");
  }

  const members = data ?? [];

  // profiles carries no foreign key from business_members — both point at
  // auth.users — so the names are read separately rather than embedded.
  const profiles = new Map<string, { full_name: string | null; phone: string | null }>();
  if (members.length > 0) {
    const { data: rows, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", members.map((m) => m.user_id));

    if (profileError) {
      // A missing name is worth degrading for; it is not worth an error page.
      console.error("[settings] profiles", profileError.code, profileError.message);
    }
    for (const row of rows ?? []) {
      profiles.set(row.id, { full_name: row.full_name, phone: row.phone });
    }
  }

  const me = user?.user?.id;

  return members.map((row) => {
    const profile = profiles.get(row.user_id) ?? null;
    return {
      id: row.id,
      userId: row.user_id,
      name: profile?.full_name?.trim() || "Unnamed teammate",
      phone: profile?.phone ?? null,
      role: row.role as MemberRole,
      status: row.status as MemberStatus,
      joinedAt: row.joined_at,
      isYou: row.user_id === me,
    };
  });
}
