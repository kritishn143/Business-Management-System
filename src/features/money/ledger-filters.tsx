"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LEDGER_KINDS } from "./ledger-kinds";

/**
 * Filters live in the URL, so the page stays a server component and a filtered
 * view can be shared or reloaded (SPEC §48).
 */
export function LedgerFilters({
  search,
  kind,
  order,
}: {
  search: string;
  kind: string;
  order: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Typing shouldn't put a navigation in the history for every keystroke.
  const [term, setTerm] = React.useState(search);
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (term !== search) set("q", term);
    }, 250);
    return () => clearTimeout(id);
  }, [term, search, set]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search these entries"
          aria-label="Search entries"
          className="h-9 pl-9"
        />
      </div>

      <Select
        value={kind}
        onChange={(e) => set("kind", e.target.value)}
        aria-label="Kind of entry"
        className="h-9 w-40"
      >
        {LEDGER_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>

      <Select
        value={order}
        onChange={(e) => set("order", e.target.value)}
        aria-label="Order"
        className="h-9 w-36"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </Select>
    </div>
  );
}
