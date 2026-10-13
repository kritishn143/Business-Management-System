"use client";

import * as React from "react";
import { useActionState } from "react";
import { SelectField } from "@/components/forms/fields";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { CURRENCIES, TIMEZONES } from "@/features/businesses/schemas";
import { formatDate, formatMoney } from "@/lib/format";
import type { CurrencyPosition, DateSystem } from "@/types/database";
import { updateLocalizationAction, type SettingsFormState } from "./actions";
import type { BusinessSettings } from "./queries";
import {
  CURRENCY_POSITIONS,
  DATE_SYSTEMS,
  MONTHS,
  NUMBER_FORMATS,
} from "./schemas";

const INITIAL: SettingsFormState = {};

const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));

/** Keeps a shop's existing value selectable even if it predates our list. */
function withCurrent(
  options: readonly { value: string; label: string }[],
  current: string,
) {
  return options.some((o) => o.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

export function LocalizationForm({
  business,
  canEdit,
}: {
  business: BusinessSettings;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(updateLocalizationAction, INITIAL);

  // Mirrored so the preview can answer "what will this look like?" before saving.
  const [currencyCode, setCurrencyCode] = React.useState(business.currency_code);
  const [currencyPosition, setCurrencyPosition] = React.useState<CurrencyPosition>(
    business.currency_position,
  );
  const [numberFormat, setNumberFormat] = React.useState(business.number_format);
  const [dateSystem, setDateSystem] = React.useState<DateSystem>(business.date_system);

  const preview = {
    currency_code: currencyCode,
    currency_position: currencyPosition,
    number_format: numberFormat,
    date_format: business.date_format,
    timezone: business.timezone,
    date_system: dateSystem,
  };

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="positive">{state.success}</FormAlert> : null}

      <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Preview
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="tabular text-xl font-semibold text-ink">
            {formatMoney(123456.78, preview)}
          </span>
          <span className="text-sm text-ink-muted">
            {formatDate(new Date().toISOString(), preview)}
          </span>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="currencyCode"
          label="Currency"
          options={withCurrent(CURRENCIES, business.currency_code)}
          defaultValue={business.currency_code}
          disabled={!canEdit}
          error={state.fieldErrors?.currencyCode}
        />
        <SelectField
          id="currencyPosition"
          label="Symbol position"
          options={CURRENCY_POSITIONS}
          defaultValue={business.currency_position}
          disabled={!canEdit}
          error={state.fieldErrors?.currencyPosition}
        />
      </div>

      <SelectField
        id="numberFormat"
        label="Number grouping"
        options={NUMBER_FORMATS}
        defaultValue={business.number_format}
        disabled={!canEdit}
        error={state.fieldErrors?.numberFormat}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="timezone"
          label="Time zone"
          hint="Decides which day a late-evening sale belongs to."
          options={withCurrent(TIMEZONES, business.timezone)}
          defaultValue={business.timezone}
          disabled={!canEdit}
          error={state.fieldErrors?.timezone}
        />
        <SelectField
          id="dateSystem"
          label="Calendar"
          hint="Display only — transactions are always stored as one canonical timestamp."
          options={DATE_SYSTEMS}
          defaultValue={business.date_system}
          disabled={!canEdit}
          error={state.fieldErrors?.dateSystem}
        />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-line p-4">
        <legend className="px-1.5 text-sm font-medium text-ink">
          Fiscal year begins
        </legend>
        <p className="text-[13px] text-ink-subtle">
          Reports use this to work out “this fiscal year”. Changing it does not
          move any transaction.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="fiscalYearStartMonth"
            label="Month"
            options={MONTH_OPTIONS}
            defaultValue={String(business.fiscal_year_start_month)}
            disabled={!canEdit}
            error={state.fieldErrors?.fiscalYearStartMonth}
          />
          <Field
            id="fiscalYearStartDay"
            label="Day"
            type="number"
            min={1}
            max={31}
            step={1}
            defaultValue={business.fiscal_year_start_day}
            disabled={!canEdit}
            error={state.fieldErrors?.fiscalYearStartDay}
          />
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex justify-end pt-1">
          <SubmitButton className="min-w-36">Save settings</SubmitButton>
        </div>
      ) : null}

      {/* The preview tracks the live selects; the form itself posts their values. */}
      <PreviewSync
        onCurrency={setCurrencyCode}
        onPosition={setCurrencyPosition}
        onNumberFormat={setNumberFormat}
        onDateSystem={setDateSystem}
      />
    </form>
  );
}

/**
 * The selects are uncontrolled so the form posts plain values; this listens
 * for changes on the form instead of turning every field into state.
 */
function PreviewSync({
  onCurrency,
  onPosition,
  onNumberFormat,
  onDateSystem,
}: {
  onCurrency: (v: string) => void;
  onPosition: (v: CurrencyPosition) => void;
  onNumberFormat: (v: string) => void;
  onDateSystem: (v: DateSystem) => void;
}) {
  const anchor = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    function onChange(event: Event) {
      const el = event.target;
      if (!(el instanceof HTMLSelectElement)) return;
      if (el.name === "currencyCode") onCurrency(el.value);
      if (el.name === "currencyPosition") onPosition(el.value as CurrencyPosition);
      if (el.name === "numberFormat") onNumberFormat(el.value);
      if (el.name === "dateSystem") onDateSystem(el.value as DateSystem);
    }

    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [onCurrency, onPosition, onNumberFormat, onDateSystem]);

  return <span ref={anchor} hidden />;
}
