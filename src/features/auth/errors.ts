/**
 * Supabase error codes are not user-facing copy (SPEC §61). Translate the
 * ones a real person can actually hit; log the rest and show a safe fallback.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password combination doesn't match an account.",
  email_not_confirmed: "Confirm your email address first — check your inbox for the link.",
  user_already_exists: "An account already exists for this email. Try signing in instead.",
  email_exists: "An account already exists for this email. Try signing in instead.",
  weak_password: "That password is too easy to guess. Try a longer one.",
  over_email_send_rate_limit:
    "Too many emails requested. Wait a few minutes before trying again.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  same_password: "Choose a password you haven't used before.",
  session_expired: "That link has expired. Request a new one.",
};

export function humanAuthError(
  error: { code?: string; message?: string } | null,
): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];

  console.error("[auth]", error.code ?? "unknown", error.message);
  return "We couldn't complete that request. Please try again.";
}
