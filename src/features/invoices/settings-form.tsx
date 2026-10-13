"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { INVOICE_FORMATS } from "./formats";
import {
  removeLogoAction,
  updateInvoiceSettingsAction,
  uploadLogoAction,
  type InvoiceSettingsState,
} from "./settings-actions";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "./settings-schemas";
import type { InvoiceConfig } from "./settings-queries";

const INITIAL: InvoiceSettingsState = {};

const FORMAT_OPTIONS = Object.entries(INVOICE_FORMATS).map(([value, spec]) => ({
  value,
  label: `${spec.label} — ${spec.hint}`,
}));

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-line accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-[13px] text-ink-subtle">{hint}</p>
      </div>
    </div>
  );
}

export function InvoiceSettingsForm({
  config,
  canEdit,
}: {
  config: InvoiceConfig;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(updateInvoiceSettingsAction, INITIAL);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="positive">{state.success}</FormAlert> : null}

      <Field
        id="heading"
        label="What the document is called"
        defaultValue={config.heading}
        required
        disabled={!canEdit}
        hint="Printed above the invoice number. A till roll always says Receipt."
        error={state.fieldErrors?.heading}
      />

      <SelectField
        id="defaultFormat"
        label="Paper to open on"
        options={FORMAT_OPTIONS}
        defaultValue={config.defaultFormat}
        disabled={!canEdit}
        hint="You can still switch size on the print screen."
        error={state.fieldErrors?.defaultFormat}
      />

      <TextareaField
        id="terms"
        label="Terms"
        defaultValue={config.terms ?? ""}
        placeholder="Goods are returnable against this invoice within seven days."
        disabled={!canEdit}
        error={state.fieldErrors?.terms}
      />

      <TextareaField
        id="bankDetails"
        label="Payment details"
        defaultValue={config.bank_details ?? ""}
        placeholder={"Bank name\nAccount name\nAccount number"}
        disabled={!canEdit}
        hint="Printed on full-page invoices only — a till roll has no room."
        error={state.fieldErrors?.bankDetails}
      />

      <Field
        id="footer"
        label="Closing line"
        defaultValue={config.footer ?? ""}
        placeholder="Thank you for your custom."
        disabled={!canEdit}
        error={state.fieldErrors?.footer}
      />

      <Field
        id="signatureLabel"
        label="Signature line"
        defaultValue={config.signature_label}
        required
        disabled={!canEdit}
        error={state.fieldErrors?.signatureLabel}
      />

      <fieldset className="space-y-3 rounded-lg border border-line p-4">
        <legend className="px-1.5 text-sm font-medium text-ink">What to print</legend>
        <Toggle
          name="showLogo"
          label="Logo"
          hint="Top left of the invoice, above your shop's name."
          defaultChecked={config.show_logo}
          disabled={!canEdit}
        />
        <Toggle
          name="showTerms"
          label="Terms"
          hint="Bottom left of a full-page invoice."
          defaultChecked={config.show_terms}
          disabled={!canEdit}
        />
        <Toggle
          name="showBank"
          label="Payment details"
          hint="For customers who pay by transfer."
          defaultChecked={config.show_bank}
          disabled={!canEdit}
        />
        <Toggle
          name="showSignature"
          label="Signature line"
          hint="A ruled line for whoever authorises the invoice."
          defaultChecked={config.show_signature}
          disabled={!canEdit}
        />
        <Toggle
          name="showAddressOnReceipt"
          label="Full address on till receipts"
          hint="Turn off to keep a narrow receipt short."
          defaultChecked={config.show_address_on_receipt}
          disabled={!canEdit}
        />
      </fieldset>

      {canEdit ? (
        <div className="flex justify-end">
          <SubmitButton className="min-w-36">Save invoice settings</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function LogoForm({
  config,
  canEdit,
}: {
  config: InvoiceConfig;
  canEdit: boolean;
}) {
  const [uploadState, upload] = useActionState(uploadLogoAction, INITIAL);
  const [removeState, remove] = useActionState(
    async () => removeLogoAction(),
    INITIAL,
  );

  const error = uploadState.error ?? removeState.error;
  const success = uploadState.success ?? removeState.success;

  return (
    <div className="space-y-4">
      {error ? <FormAlert tone="critical">{error}</FormAlert> : null}
      {success ? <FormAlert tone="positive">{success}</FormAlert> : null}

      {config.logoUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-line bg-white p-2">
            {/* The logo is a signed URL on a private bucket, so it is not a
                candidate for the image optimiser. */}
            <Image
              src={config.logoUrl}
              alt="Your shop's logo"
              width={144}
              height={64}
              unoptimized
              className="max-h-16 w-auto object-contain"
            />
          </div>
          {canEdit ? (
            <form action={remove}>
              <Button type="submit" variant="secondary" size="sm">
                <Trash2 />
                Remove logo
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">
          No logo yet. Invoices print your shop&rsquo;s name instead.
        </p>
      )}

      {canEdit ? (
        <form action={upload} className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted transition-colors hover:border-accent hover:text-ink">
            <Upload className="size-4" aria-hidden />
            Choose an image
            <input
              type="file"
              name="logo"
              accept={LOGO_TYPES.join(",")}
              required
              className="sr-only"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </label>
          <p className="text-[13px] text-ink-subtle">
            PNG, JPEG, WebP or SVG, up to {Math.round(LOGO_MAX_BYTES / 1024 / 1024)} MB.
            Stored privately and only ever served through a short-lived link.
          </p>
        </form>
      ) : null}
    </div>
  );
}
