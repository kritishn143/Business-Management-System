import type { Metadata } from "next";
import { LocalizationForm } from "@/features/settings/localization-form";
import { loadSettings } from "@/features/settings/queries";
import { SettingsCard, SettingsSection } from "@/features/settings/section";

export const metadata: Metadata = { title: "Currency and dates" };

export default async function LocalizationSettingsPage() {
  const { business, role } = await loadSettings();
  const canEdit = role === "owner";

  return (
    <SettingsSection
      title="Currency and dates"
      description="How money, numbers and dates are shown throughout the app."
      readOnlyNote={
        canEdit ? undefined : "Only an owner can change these settings. You can look, though."
      }
    >
      <SettingsCard>
        <LocalizationForm business={business} canEdit={canEdit} />
      </SettingsCard>
    </SettingsSection>
  );
}
