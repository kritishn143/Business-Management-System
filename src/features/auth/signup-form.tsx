"use client";

import { useActionState } from "react";
import { signupAction, type FormState } from "./actions";
import { Field, FormAlert, SubmitButton } from "./form-parts";

const INITIAL: FormState = {};

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, INITIAL);

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
        id="fullName"
        label="Your name"
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
