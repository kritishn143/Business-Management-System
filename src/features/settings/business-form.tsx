"use client";

import { useActionState } from "react";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { BUSINESS_CATEGORIES, BUSINESS_TYPES } from "@/features/businesses/schemas";
import { updateBusinessProfileAction, type SettingsFormState } from "./actions";
import type { BusinessSettings } from "./queries";

const INITIAL: SettingsFormState = {};

export function BusinessForm({
  business,
  canEdit,
}: {
  business: BusinessSettings;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(updateBusinessProfileAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="positive">{state.success}</FormAlert> : null}

      <Field
        id="name"
        label="Shop name"
        defaultValue={business.name}
        autoComplete="organization"
        required
        disabled={!canEdit}
        hint="This appears on invoices and statements."
        error={state.fieldErrors?.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="businessType"
          label="What kind of business"
          options={BUSINESS_TYPES}
          defaultValue={business.business_type ?? "retail"}
          disabled={!canEdit}
          error={state.fieldErrors?.businessType}
        />
        <SelectField
          id="category"
          label="What you sell"
          options={BUSINESS_CATEGORIES}
          defaultValue={business.category ?? "stationery"}
          disabled={!canEdit}
          error={state.fieldErrors?.category}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="phone"
          label="Phone"
          type="tel"
          defaultValue={business.phone ?? ""}
          autoComplete="tel"
          disabled={!canEdit}
          error={state.fieldErrors?.phone}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          defaultValue={business.email ?? ""}
          autoComplete="email"
          disabled={!canEdit}
          error={state.fieldErrors?.email}
        />
      </div>

      <TextareaField
        id="address"
        label="Address"
        defaultValue={business.address ?? ""}
        placeholder="Street, ward, city"
        disabled={!canEdit}
        error={state.fieldErrors?.address}
      />

      <Field
        id="registrationNumber"
        label="Registration number"
        defaultValue={business.registration_number ?? ""}
        disabled={!canEdit}
        hint="PAN, VAT or whatever your authority issues. Printed on invoices when set."
        error={state.fieldErrors?.registrationNumber}
      />

      {canEdit ? (
        <div className="flex justify-end pt-1">
          <SubmitButton className="min-w-36">Save details</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
