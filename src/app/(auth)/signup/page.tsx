import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Create your BMS account
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">
        You&apos;ll set up your shop in the next step.
      </p>

      <SignupForm />

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
