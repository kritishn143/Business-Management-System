"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchBusinessAction } from "@/features/businesses/actions";

export type BusinessSummary = {
  id: string;
  name: string;
};

/**
 * Tenant selector. The active business is held in a cookie and validated
 * server-side, so choosing one is a form submission rather than client state
 * (SPEC §27, §44).
 */
export function BusinessSwitcher({
  businesses,
  activeId,
}: {
  businesses: BusinessSummary[];
  activeId?: string;
}) {
  const active = businesses.find((b) => b.id === activeId) ?? businesses[0];

  if (!active) {
    return (
      <div className="mx-3 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm text-ink-subtle">
        No business yet
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="mx-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-ink">
          {active.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {active.name}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[15rem]">
        <DropdownMenuLabel>Businesses</DropdownMenuLabel>

        {businesses.map((b) => {
          const current = b.id === active.id;
          return (
            <DropdownMenuItem key={b.id} asChild disabled={current}>
              {/* A form, because switching is a server decision: the cookie is
                  only honoured once membership has been checked. */}
              <form action={switchBusinessAction} className="w-full">
                <input type="hidden" name="businessId" value={b.id} />
                <button
                  type="submit"
                  disabled={current}
                  className="flex w-full items-center gap-2 text-left disabled:cursor-default"
                >
                  <Check className={current ? "size-4 opacity-100" : "size-4 opacity-0"} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                </button>
              </form>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/businesses/new" className="flex items-center gap-2">
            <Plus className="size-4" />
            Add a business
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
