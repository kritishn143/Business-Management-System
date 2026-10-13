import type { Metadata } from "next";
import { BusinessForm } from "@/features/settings/business-form";
import { loadSettings } from "@/features/settings/queries";
import { SettingsCard, SettingsSection } from "@/features/settings/section";

export const metadata: Metadata = { title: "Business details" };

export default async function BusinessSettingsPage() {
  const { business, role } = await loadSettings();
  const canEdit = role === "owner";

  return (
    <SettingsSection
      title="Business details"
      description="Who you are, as it appears to your customers."
      readOnlyNote={
        canEdit ? undefined : "Only an owner can change these details. You can look, though."
      }
    >
      <SettingsCard>
        <BusinessForm business={business} canEdit={canEdit} />
      </SettingsCard>
    </SettingsSection>
  );
}
