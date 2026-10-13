import { cn } from "@/lib/utils";

/**
 * BMS mark — a nib abstracted to a single downward stroke meeting a point.
 * Drawn with currentColor so it inherits ink or accent by context.
 */
export function BmsMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <path
        d="M19 3.5c0 7.2-4.1 12.4-9.6 14.2L6 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 3.5c-6.9.9-11.4 4.3-12.4 9.1-.2 1 .1 2 .8 2.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink",
        className,
      )}
    >
      <BmsMark className="size-[22px] text-accent" />
      BMS
    </span>
  );
}
