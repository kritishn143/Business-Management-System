import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="flex h-20 shrink-0 items-center px-6 sm:px-10">
        <Link href="/dashboard" aria-label="BMS home">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-6 pb-20">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
