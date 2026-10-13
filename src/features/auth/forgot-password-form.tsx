"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "./actions";
import { Field, FormAlert, SubmitButton } from "./form-parts";

const INITIAL: FormState = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL);

  if (state.success) {
    return (
      <div className="mt-8">
        <FormAlert tone="positive">{state.success}</FormAlert>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-4">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
