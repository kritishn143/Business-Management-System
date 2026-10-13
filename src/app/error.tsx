"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[boundary]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-critical-wash">
        <TriangleAlert className="size-5 text-critical" />
      </span>
      <h1 className="mt-5 text-lg font-semibold text-ink">
        Something went wrong on our side
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
        No data was changed. Try again, and if it keeps happening let us know
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
