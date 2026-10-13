import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">
        You&apos;ll be signed in once it&apos;s saved.
      </p>

      <ResetPasswordForm />
    </div>
  );
}
