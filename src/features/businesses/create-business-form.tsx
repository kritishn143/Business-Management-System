"use client";

import { useActionState } from "react";
import { SelectField } from "@/components/forms/fields";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { createBusinessAction, type BusinessFormState } from "./actions";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_TYPES,
  CURRENCIES,
  TIMEZONES,
} from "./schemas";

const INITIAL: BusinessFormState = {};

export function CreateBusinessForm() {
  const [state, formAction] = useActionState(createBusinessAction, INITIAL);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <Field
        id="name"
        label="Shop name"
        placeholder="e.g. Sunrise Stationers"
        autoComplete="organization"
        autoFocus
        required
        error={state.fieldErrors?.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="businessType"
          label="What kind of business"
          options={BUSINESS_TYPES}
          defaultValue="retail"
          error={state.fieldErrors?.businessType}
        />
        <SelectField
          id="category"
          label="What you sell"
          options={BUSINESS_CATEGORIES}
          defaultValue="stationery"
          error={state.fieldErrors?.category}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="currencyCode"
          label="Currency"
          options={CURRENCIES}
          defaultValue="NPR"
          error={state.fieldErrors?.currencyCode}
        />
        <SelectField
          id="timezone"
          label="Time zone"
          options={TIMEZONES}
          defaultValue="Asia/Kathmandu"
          error={state.fieldErrors?.timezone}
        />
      </div>

      <SelectField
        id="dateSystem"
        label="Calendar for dates"
        hint="Transactions are always stored in a single canonical format; this only changes how dates are shown."
        options={[
          { value: "AD", label: "Gregorian (AD)" },
          { value: "BS", label: "Bikram Sambat (BS)" },
        ]}
        defaultValue="AD"
        error={state.fieldErrors?.dateSystem}
      />

      <Field
        id="locationName"
        label="Where you sell from"
        placeholder="Main counter"
        hint="You can add more branches or storerooms later."
        error={state.fieldErrors?.locationName}
      />

      <SubmitButton>Create shop</SubmitButton>
    </form>
  );
}
