"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3">
      {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent-wash font-medium text-accent"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] shrink-0",
                active ? "text-accent" : "text-ink-subtle group-hover:text-ink-muted",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
