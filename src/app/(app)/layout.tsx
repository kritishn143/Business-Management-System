import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { listMemberships } from "@/features/businesses/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * The real auth boundary. Proxy only does an optimistic redirect; this layout
 * revalidates the JWT server-side before any app chrome renders (SPEC §44).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const memberships = await listMemberships();
  if (memberships.length === 0) redirect("/onboarding/business");

  const fullName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "You";

  return (
    <AppShell
      // Listed by name so the menu order is stable; the active one is named
      // explicitly rather than inferred from position.
      businesses={memberships
        .map((m) => ({ id: m.business.id, name: m.business.name }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      activeBusinessId={memberships[0].business.id}
      user={{ id: user.id, name: fullName, email: user.email ?? "" }}
    >
      {children}
    </AppShell>
  );
}
