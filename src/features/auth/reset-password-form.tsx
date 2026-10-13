"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type FormState } from "./actions";
import { Field, FormAlert, SubmitButton } from "./form-parts";

const INITIAL: FormState = {};

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      {state.error ? (
        <>
          <FormAlert tone="critical">{state.error}</FormAlert>
          <p className="text-center text-sm text-ink-muted">
            <Link
              href="/forgot-password"
              className="font-medium text-accent hover:underline"
            >
              Request a new link
            </Link>
          </p>
        </>
      ) : null}

      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <Field
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton>Save password</SubmitButton>
    </form>
  );
}
