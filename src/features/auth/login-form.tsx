"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "./actions";
import { Field, FormAlert, SubmitButton } from "./form-parts";

const INITIAL: FormState = {};

export function LoginForm({
  next,
  linkExpired,
}: {
  next?: string;
  linkExpired?: boolean;
}) {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {linkExpired && !state.error ? (
        <FormAlert tone="critical">
          That link has expired. Sign in, or request a new reset link.
        </FormAlert>
      ) : null}
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <div>
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-[13px] text-ink-muted hover:text-ink hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
