import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Every surface gets a useful empty state, never a bare "No data" (SPEC §60).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-surface-sunken">
        <Icon className="size-5 text-ink-subtle" />
      </span>
      <h2 className="mt-5 text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
        {description}
      </p>
      {/* Flex so an empty state can offer a second way forward. */}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
