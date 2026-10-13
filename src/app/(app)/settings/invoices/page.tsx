import type { Metadata } from "next";
import { loadInvoiceSettingsPage } from "@/features/invoices/settings-queries";
import { InvoiceSettingsForm, LogoForm } from "@/features/invoices/settings-form";
import { SettingsCard, SettingsSection } from "@/features/settings/section";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoiceSettingsPage() {
  const { config, role } = await loadInvoiceSettingsPage();
  const canEdit = role === "owner" || role === "manager";

  return (
    <SettingsSection
      title="Invoices"
      description="How your invoices and receipts look. Changing these never alters a past sale — only how it prints."
      readOnlyNote={
        canEdit
          ? undefined
          : "Only an owner or manager can change your invoices. You can look, though."
      }
    >
      <div className="mb-6 rounded-xl border border-line bg-surface-raised p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium text-ink">Your logo</h2>
        <LogoForm config={config} canEdit={canEdit} />
      </div>

      <SettingsCard>
        <InvoiceSettingsForm config={config} canEdit={canEdit} />
      </SettingsCard>

      <p className="mt-6 text-[13px] text-ink-subtle">
        Invoice appearance is kept separate from the sale itself, so reprinting an
        old invoice after changing these shows today&rsquo;s wording against the
        original figures.
      </p>
    </SettingsSection>
  );
}
