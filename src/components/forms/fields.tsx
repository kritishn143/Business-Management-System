"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The hint/error line every field shares. Errors replace hints rather than
 * stacking, so the field never grows as you fix it.
 */
function FieldNote({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint?: string;
}) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-[13px] text-critical">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-[13px] text-ink-subtle">
        {hint}
      </p>
    );
  }
  return null;
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  defaultValue,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        name={id}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextareaField({
  id,
  label,
  hint,
  error,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}
