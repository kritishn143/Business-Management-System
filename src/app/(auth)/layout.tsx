import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="flex h-20 shrink-0 items-center px-6 sm:px-10">
        <Link href="/" aria-label="BMS home">
          <Wordmark />
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pb-20 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
