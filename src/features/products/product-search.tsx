"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ProductSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const first = useRef(true);

  // Debounced so typing does not fire a query per keystroke (SPEC §65).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`/inventory?${next.toString()}`);
    }, 300);

    return () => clearTimeout(id);
  }, [value, params, router]);

  return (
    <div className="relative max-w-sm flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by name, SKU or barcode"
        aria-label="Search products"
        className="pl-9"
      />
    </div>
  );
}
