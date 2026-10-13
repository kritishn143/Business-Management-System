"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { LOGO_BUCKET } from "./settings-queries";
import {
  invoiceSettingsSchema,
  logoExtension,
  validateLogo,
} from "./settings-schemas";

export type InvoiceSettingsState = {
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

function revalidateInvoices() {
  revalidatePath("/settings/invoices");
  // Any printed invoice reflects these immediately.
  revalidatePath("/sales", "layout");
}

export async function updateInvoiceSettingsAction(
  _prev: InvoiceSettingsState,
  formData: FormData,
): Promise<InvoiceSettingsState> {
  const parsed = invoiceSettingsSchema.safeParse({
    heading: formData.get("heading"),
    terms: formData.get("terms") ?? "",
    footer: formData.get("footer") ?? "",
    bankDetails: formData.get("bankDetails") ?? "",
    signatureLabel: formData.get("signatureLabel"),
    // An unchecked box is absent from the form entirely.
    showLogo: formData.get("showLogo") === "on",
    showSignature: formData.get("showSignature") === "on",
    showTerms: formData.get("showTerms") === "on",
    showBank: formData.get("showBank") === "on",
    showAddressOnReceipt: formData.get("showAddressOnReceipt") === "on",
    defaultFormat: formData.get("defaultFormat"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const { business } = await loadActiveBusiness();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("invoice_settings")
    .update(
      {
        heading: parsed.data.heading,
        terms: parsed.data.terms,
        footer: parsed.data.footer,
        bank_details: parsed.data.bankDetails,
        signature_label: parsed.data.signatureLabel,
        show_logo: parsed.data.showLogo,
        show_signature: parsed.data.showSignature,
        show_terms: parsed.data.showTerms,
        show_bank: parsed.data.showBank,
        show_address_on_receipt: parsed.data.showAddressOnReceipt,
        default_format: parsed.data.defaultFormat,
      },
      { count: "exact" },
    )
    .eq("business_id", business.id);

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to change your invoices." };
    }
    console.error("[invoices] update settings", error.code, error.message);
    return { error: "We couldn't save that. Please try again." };
  }
  // RLS refuses by filtering, so nothing changed means not allowed.
  if (count === 0) {
    return { error: "Only an owner or manager can change your invoices." };
  }

  revalidateInvoices();
  return { success: "Invoice settings saved." };
}

export async function uploadLogoAction(
  _prev: InvoiceSettingsState,
  formData: FormData,
): Promise<InvoiceSettingsState> {
  const file = formData.get("logo");

  if (!(file instanceof File)) return { error: "Choose an image to upload." };

  const problem = validateLogo(file);
  if (problem) return { error: problem };

  const { business } = await loadActiveBusiness();
  const supabase = await createClient();

  // The path names the owning business, which storage policies check (SPEC §54).
  const path = `business/${business.id}/branding/logo.${logoExtension(file.type)}`;

  const upload = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (upload.error) {
    console.error("[invoices] logo upload", upload.error.message);
    return {
      error:
        "We couldn't upload that image. Check you have permission to change the shop's branding.",
    };
  }

  const { error, count } = await supabase
    .from("invoice_settings")
    .update({ logo_path: path, show_logo: true }, { count: "exact" })
    .eq("business_id", business.id);

  if (error || count === 0) {
    // The file landed but the row did not, so leave nothing dangling.
    await supabase.storage.from(LOGO_BUCKET).remove([path]);
    return { error: "Only an owner or manager can change your invoices." };
  }

  revalidateInvoices();
  return { success: "Logo uploaded." };
}

/** Takes no arguments: there is nothing to read from the form. */
export async function removeLogoAction(): Promise<InvoiceSettingsState> {
  const { business } = await loadActiveBusiness();
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoice_settings")
    .select("logo_path")
    .eq("business_id", business.id)
    .maybeSingle();

  const { error, count } = await supabase
    .from("invoice_settings")
    .update({ logo_path: null }, { count: "exact" })
    .eq("business_id", business.id);

  if (error || count === 0) {
    return { error: "Only an owner or manager can change your invoices." };
  }

  // Clear the row first: a failed delete leaves an orphan file, not a broken
  // invoice.
  if (data?.logo_path) {
    await supabase.storage.from(LOGO_BUCKET).remove([data.logo_path]);
  }

  revalidateInvoices();
  return { success: "Logo removed." };
}
