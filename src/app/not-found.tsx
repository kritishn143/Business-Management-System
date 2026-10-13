import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-surface-sunken">
        <Compass className="size-5 text-ink-subtle" />
      </span>
      <h1 className="mt-5 text-lg font-semibold text-ink">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
        The link may be out of date, or the page may not exist yet.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </div>
  );
}
