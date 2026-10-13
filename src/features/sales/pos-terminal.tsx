"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  calculateTotals,
  lineTotal,
  type CartLine,
} from "@/domain/sales/totals";
import { fromDecimalString, toDecimalString } from "@/domain/money/decimal";
import { formatMoney, type FormatContext } from "@/lib/format";
import {
  listCatalogueForCache,
  searchPosProducts,
  type PosCustomer,
  type PosProduct,
} from "./actions";
import { submitSale } from "./sale-repository";
import {
  loadCatalogue,
  saveCatalogue,
  searchCachedProducts,
  type CachedProduct,
} from "@/lib/offline/catalogue";
import { useSync } from "@/lib/offline/sync-provider";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "qr", label: "QR" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
] as const;

/** The counter's own view of a product, so the cache is not tied to the DTO. */
function toCached(p: PosProduct): CachedProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    unitId: p.base_unit_id,
    unitSymbol: p.unit_symbol,
    sellingPrice: p.selling_price,
    stock: String(p.quantity),
  };
}

function fromCached(p: CachedProduct): PosProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    selling_price: p.sellingPrice,
    base_unit_id: p.unitId,
    unit_symbol: p.unitSymbol ?? "",
    // Stock is whatever the cache last saw; the ledger on the server decides.
    quantity: Number(p.stock ?? 0),
    track_inventory: true,
  };
}

export function PosTerminal({
  ctx,
  customers,
  actorId = null,
}: {
  ctx: FormatContext;
  customers: PosCustomer[];
  actorId?: string | null;
}) {
  const router = useRouter();
  const sync = useSync();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<PosProduct[]>([]);
  const [highlight, setHighlight] = React.useState(0);
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [discountText, setDiscountText] = React.useState("");
  const [method, setMethod] = React.useState<string>("cash");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [paidText, setPaidText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // A fresh key per sale attempt, so a retry after a network failure is
  // recognised by the server as the same sale (SPEC §52).
  const [txnId, setTxnId] = React.useState(() => crypto.randomUUID());

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    listCatalogueForCache()
      .then((products) => saveCatalogue(products.map(toCached)))
      .catch(() => {
        // Nothing to do: searching will still cache what it finds.
      });
  }, []);

  // The counter must keep working without a connection, so every server
  // search also refreshes a local copy, and a failed search falls back to it
  // (SPEC §50).
  React.useEffect(() => {
    let cancelled = false;

    const id = setTimeout(async () => {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new Error("offline");
        }
        const found = await searchPosProducts(term);
        if (cancelled) return;
        setResults(found);
        setHighlight(0);
        void saveCatalogue(found.map(toCached));
      } catch {
        const snapshot = await loadCatalogue();
        if (cancelled) return;
        setResults(
          searchCachedProducts(snapshot?.products ?? [], term).map(fromCached),
        );
        setHighlight(0);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [term]);

  const discount = React.useMemo(
    () => (discountText ? fromDecimalString(discountText) : 0),
    [discountText],
  );
  const totals = React.useMemo(
    () =>
      calculateTotals({
        lines,
        discount,
        paid: paidText ? fromDecimalString(paidText) : 0,
      }),
    [lines, discount, paidText],
  );

  function addProduct(p: PosProduct) {
    setLines((current) => {
      const existing = current.findIndex((l) => l.productId === p.id);
      if (existing >= 0) {
        const next = [...current];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      return [
        ...current,
        {
          productId: p.id,
          name: p.name,
          unitId: p.base_unit_id,
          unitSymbol: p.unit_symbol,
          conversionToBase: 1,
          quantity: 1,
          unitPrice: fromDecimalString(p.selling_price),
          lineDiscount: 0,
        },
      ];
    });
    setTerm("");
    searchRef.current?.focus();
  }

  function setQuantity(index: number, value: string) {
    const qty = Number(value);
    setLines((current) =>
      current.map((l, i) =>
        i === index ? { ...l, quantity: Number.isFinite(qty) && qty > 0 ? qty : l.quantity } : l,
      ),
    );
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  async function takePayment() {
    if (lines.length === 0) {
      toast.error("Add at least one item first.");
      return;
    }

    if (method === "credit" && !customerId) {
      toast.error("Choose a customer to sell on credit.");
      return;
    }

    setBusy(true);
    const result = await submitSale({
      lines: lines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        quantity: l.quantity,
        unitPrice: Number(toDecimalString(l.unitPrice)),
        lineDiscount: Number(toDecimalString(l.lineDiscount)),
      })),
      discount: Number(toDecimalString(discount)),
      additionalCharge: 0,
      roundOff: 0,
      method,
      customerId: customerId || null,
      // A credit sale is paid later, so nothing is taken now.
      paid: method === "credit" ? 0 : Number(toDecimalString(totals.total)),
      notes: null,
      clientTransactionId: txnId,
    }, actorId);
    setBusy(false);

    if (result.state === "refused") {
      toast.error(result.error);
      return;
    }

    if (result.state === "queued") {
      // Honest wording: it is on this device, not yet in the books.
      toast.success("Sale saved on this device. It will sync when you're back online.", {
        description: "Nothing is lost — check “Waiting to sync” under Sales.",
      });
      sync?.refresh();
    } else {
      toast.success(`Sale ${result.invoiceNumber} completed`);
    }

    setLines([]);
    setDiscountText("");
    setPaidText("");
    setCustomerId("");
    setMethod("cash");
    setTxnId(crypto.randomUUID());
    searchRef.current?.focus();
    router.refresh();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      addProduct(results[highlight]);
    }
  }

  // Ctrl/Cmd + Enter takes payment from anywhere on the screen (SPEC §74).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void takePayment();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {sync && !sync.online ? (
        <div
          role="status"
          className="rounded-lg bg-caution-wash px-4 py-3 text-[13px] text-caution lg:col-span-2"
        >
          <strong className="font-medium">You&rsquo;re offline.</strong> Keep selling —
          each sale is saved on this device and syncs when you reconnect. Stock figures
          are from the last time this device was online.
        </div>
      ) : null}

      {/* Search and results */}
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            ref={searchRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search or scan a product, then press Enter"
            aria-label="Search products to add"
            autoFocus
            className="h-11 pl-9"
          />
        </div>

        <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
          {results.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-ink-muted">
              {term ? `Nothing matches “${term}”.` : "Start typing to find a product."}
            </li>
          ) : (
            results.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  onMouseEnter={() => setHighlight(i)}
                  className={
                    "flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition-colors " +
                    (i === highlight ? "bg-accent-wash" : "hover:bg-surface-sunken")
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-subtle">
                      {p.sku ? `${p.sku} · ` : ""}
                      {p.track_inventory ? `${p.quantity} ${p.unit_symbol} in stock` : "Not tracked"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-ink">
                    {formatMoney(p.selling_price, ctx)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Current sale */}
      <div className="flex flex-col rounded-xl border border-line bg-surface-raised">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Current sale</h2>
        </div>

        <div className="min-h-40 flex-1 divide-y divide-[var(--line)]">
          {lines.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">
              Nothing added yet.
            </p>
          ) : (
            lines.map((l, i) => (
              <div key={l.productId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {l.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label={`Remove ${l.name}`}
                    className="shrink-0 rounded p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-critical"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={String(l.quantity)}
                    onChange={(e) => setQuantity(i, e.target.value)}
                    inputMode="decimal"
                    aria-label={`Quantity of ${l.name}`}
                    className="tabular h-8 w-16 text-center"
                  />
                  <span className="text-xs text-ink-subtle">
                    × {formatMoney(toDecimalString(l.unitPrice), ctx)}
                  </span>
                  <span className="tabular ml-auto text-sm font-medium text-ink">
                    {formatMoney(toDecimalString(lineTotal(l)), ctx)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t border-line px-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">Subtotal</span>
            <span className="tabular text-ink">
              {formatMoney(toDecimalString(totals.subtotal), ctx)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <Label htmlFor="discount" className="text-ink-muted font-normal">
              Discount
            </Label>
            <Input
              id="discount"
              value={discountText}
              onChange={(e) => setDiscountText(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="tabular h-8 w-24 text-right"
            />
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold text-ink">Total</span>
            <span className="tabular text-lg font-semibold text-ink">
              {formatMoney(toDecimalString(totals.total), ctx)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="method">Payment</Label>
            <Select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="credit" disabled={customers.length === 0}>
                On credit{customers.length === 0 ? " — add a customer first" : ""}
              </option>
            </Select>
          </div>

          {method === "credit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="customerId">Customer</Label>
              <Select
                id="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-9"
                required
              >
                <option value="">Choose a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </Select>
              <p className="text-[13px] text-ink-subtle">
                The full amount is added to their account.
              </p>
            </div>
          ) : null}

          <Button
            onClick={() => void takePayment()}
            disabled={busy || lines.length === 0}
            className="h-11 w-full"
          >
            {busy ? "Completing…" : method === "credit" ? "Put on account" : "Take payment"}
          </Button>
          <p className="text-center text-[11px] text-ink-subtle">
            Ctrl/⌘ + Enter to complete
          </p>
        </div>
      </div>
    </div>
  );
}
