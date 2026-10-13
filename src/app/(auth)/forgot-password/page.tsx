import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Reset your password
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">
        We&apos;ll email you a link to choose a new one.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
