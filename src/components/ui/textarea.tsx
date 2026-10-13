import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink",
        "placeholder:text-ink-subtle transition-colors",
        "hover:border-line-strong",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-critical",
        className,
      )}
      {...props}
    />
  );
}
