import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native select. Deliberate: it is keyboard- and screen-reader-correct for
 * free, and these are short, ordinary option lists.
 */
export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-line bg-surface pl-3 pr-9 text-sm text-ink",
          "transition-colors hover:border-line-strong",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-critical",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
    </div>
  );
}
