import { cn } from "@/lib/utils";

/** Compact, quiet data table (SPEC §4). Scrolls horizontally on its own. */
export function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-line bg-surface-raised",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table className={cn("w-full border-collapse text-sm", className)} {...props} />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b border-line px-4 py-3 text-ink", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("transition-colors last:[&>td]:border-0 hover:bg-surface-sunken", className)}
      {...props}
    />
  );
}
