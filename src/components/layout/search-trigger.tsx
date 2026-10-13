"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "@/features/search/command-palette";

/** Opens the command palette (SPEC §73). */
export function SearchTrigger() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl + K, and "/" when the user is not already typing.
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-line bg-surface-sunken px-3 text-sm text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          Search products, people, invoices
        </span>
        <kbd className="hidden shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-ink-subtle sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
