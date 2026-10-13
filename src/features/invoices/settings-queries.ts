import { createClient } from "@/lib/supabase/server";
import { loadActiveBusiness } from "@/features/businesses/queries";
import type { InvoiceSettings, MemberRole } from "@/types/database";
import { resolveFormat, type InvoiceFormatKey } from "./formats";

export const LOGO_BUCKET = "business-files";
/** An hour is plenty for a page render or a print, and nothing is left public. */
const SIGNED_URL_SECONDS = 3600;

export type InvoiceConfig = Omit<InvoiceSettings, "default_format"> & {
  defaultFormat: InvoiceFormatKey;
  /** A short-lived signed URL, since the bucket is private (SPEC §54). */
  logoUrl: string | null;
};

const FIELDS =
  "business_id, logo_path, heading, terms, footer, bank_details, signature_label, show_logo, show_signature, show_terms, show_bank, show_address_on_receipt, default_format, created_at, updated_at";

/** Falls back to the defaults the table would have given a new shop. */
function defaults(businessId: string): InvoiceSettings {
  const now = new Date().toISOString();
  return {
    business_id: businessId,
    logo_path: null,
    heading: "Tax invoice",
    terms: null,
    footer: null,
    bank_details: null,
    signature_label: "Authorised signature",
    show_logo: true,
    show_signature: true,
    show_terms: true,
    show_bank: false,
    show_address_on_receipt: true,
    default_format: "a4",
    created_at: now,
    updated_at: now,
  };
}

export async function loadInvoiceConfig(businessId: string): Promise<InvoiceConfig> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoice_settings")
    .select(FIELDS)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    console.error("[invoices] settings", error.code, error.message);
  }

  const row = (data as InvoiceSettings | null) ?? defaults(businessId);

  let logoUrl: string | null = null;
  if (row.logo_path && row.show_logo) {
    const signed = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(row.logo_path, SIGNED_URL_SECONDS);

    if (signed.error) {
      // A missing or unreadable logo must not stop an invoice printing.
      console.error("[invoices] logo url", signed.error.message);
    }
    logoUrl = signed.data?.signedUrl ?? null;
  }

  const { default_format, ...rest } = row;

  return { ...rest, defaultFormat: resolveFormat(default_format), logoUrl };
}

/** The settings page also needs to know whether the reader may change them. */
export async function loadInvoiceSettingsPage(): Promise<{
  config: InvoiceConfig;
  role: MemberRole;
  businessId: string;
}> {
  const { business, role } = await loadActiveBusiness();
  const config = await loadInvoiceConfig(business.id);
  return { config, role, businessId: business.id };
}
