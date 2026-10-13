import type { Metadata } from "next";
import { loadSettings, listStaff } from "@/features/settings/queries";
import { SettingsSection } from "@/features/settings/section";
import { StaffTable } from "@/features/settings/staff-table";
import { ASSIGNABLE_ROLES } from "@/features/settings/schemas";

export const metadata: Metadata = { title: "People" };

export default async function UsersSettingsPage() {
  const { business, role } = await loadSettings();
  const staff = await listStaff(business.id);
  const canManage = role === "owner" || role === "manager";

  return (
    <SettingsSection
      title="People"
      description="Who can get into this shop, and what each of them may do."
      readOnlyNote={
        canManage ? undefined : "Only an owner or manager can change who has access."
      }
    >
      <StaffTable staff={staff} viewerRole={role} />

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-medium text-ink">What each role can do</h2>
        <dl className="mt-3 space-y-2">
          {ASSIGNABLE_ROLES.map((r) => (
            <div key={r.value} className="flex flex-wrap gap-x-2 text-[13px]">
              <dt className="min-w-36 font-medium text-ink">{r.label}</dt>
              <dd className="text-ink-muted">{r.hint}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-line pt-4 text-[13px] text-ink-subtle">
          These limits are enforced by the database, not just this screen, so they
          hold however the data is reached.
        </p>
      </div>

      <p className="mt-6 text-[13px] text-ink-subtle">
        Adding a teammate needs an email invitation, which has to be issued
        server-side; that lands with the rest of the security work. Until then this
        screen manages the people who are already here.
      </p>
    </SettingsSection>
  );
}
