"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { humanAuthError } from "./errors";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "./schemas";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only allow same-origin relative paths — never an attacker-supplied URL. */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

async function originUrl(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}${path}`;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: humanAuthError(error) };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const { fullName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: await originUrl("/auth/callback"),
    },
  });
  if (error) return { error: humanAuthError(error) };

  // With email confirmation on, no session is returned yet.
  if (!data.session) {
    return {
      success: `Check ${email} for a link to confirm your account.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await originUrl("/auth/callback?next=/reset-password"),
  });

  // Rate limits are worth surfacing; anything else stays silent so this
  // endpoint cannot be used to enumerate which emails have accounts.
  if (error && error.code === "over_email_send_rate_limit") {
    return { error: humanAuthError(error) };
  }
  if (error) console.error("[auth] resetPasswordForEmail", error.code, error.message);

  return {
    success:
      "If an account exists for that address, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();

  // The recovery link must have established a session before we get here.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "That reset link has expired. Request a new one to continue.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: humanAuthError(error) };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
