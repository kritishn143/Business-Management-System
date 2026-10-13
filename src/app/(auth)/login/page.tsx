import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const linkError = params.error === "link_expired";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Sign in to BMS
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">
        Pick up where your shop left off.
      </p>

      <LoginForm next={next} linkExpired={linkError} />

      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
