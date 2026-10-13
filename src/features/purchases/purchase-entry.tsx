"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { fromDecimalString, multiply, sum, toDecimalString } from "@/domain/money/decimal";
import { formatMoney, type FormatContext } from "@/lib/format";
import {
  completePurchaseAction,
  searchPurchaseProducts,
  type PurchaseProduct,
} from "./actions";

type BillLine = {
  productId: string;
  name: string;
  unitId: string;
  unitSymbol: string;
  quantity: number;
  unitCostText: string;
};

export function PurchaseEntry({
  ctx,
  suppliers,
}: {
  ctx: FormatContext;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<PurchaseProduct[]>([]);
  const [lines, setLines] = React.useState<BillLine[]>([]);
  const [supplierId, setSupplierId] = React.useState("");
  const [supplierInvoice, setSupplierInvoice] = React.useState("");
  const [payNow, setPayNow] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [txnId, setTxnId] = React.useState(() => crypto.randomUUID());

  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const found = await searchPurchaseProducts(term);
      if (!cancelled) setResults(found);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [term]);

  const total = React.useMemo(
    () =>
      sum(
        lines.map((l) =>
          multiply(fromDecimalString(l.unitCostText || "0"), l.quantity),
        ),
      ),
    [lines],
  );

  function addProduct(p: PurchaseProduct) {
    setLines((current) => {
      if (current.some((l) => l.productId === p.id)) return current;
      return [
        ...current,
        {
          productId: p.id,
          name: p.name,
          unitId: p.base_unit_id,
          unitSymbol: p.unit_symbol,
          quantity: 1,
          unitCostText: p.purchase_price,
        },
      ];
    });
    setTerm("");
    searchRef.current?.focus();
  }

  function updateLine(index: number, patch: Partial<BillLine>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function record() {
    if (lines.length === 0) {
      toast.error("Add at least one item to the bill.");
      return;
    }
    if (!payNow && !supplierId) {
      toast.error("Choose a supplier to leave the bill unpaid.");
      return;
    }

    setBusy(true);
    const result = await completePurchaseAction({
      lines: lines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        quantity: l.quantity,
        unitCost: Number(toDecimalString(fromDecimalString(l.unitCostText || "0"))),
      })),
      supplierId: supplierId || null,
      paidAmount: payNow ? Number(toDecimalString(total)) : 0,
      supplierInvoice: supplierInvoice.trim() || null,
      clientTransactionId: txnId,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Bill ${result.invoiceNumber} recorded`);
    setLines([]);
    setSupplierId("");
    setSupplierInvoice("");
    setPayNow(true);
    setTxnId(crypto.randomUUID());
    searchRef.current?.focus();
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            ref={searchRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a product to add to this bill"
            aria-label="Search products"
            autoFocus
            className="h-11 pl-9"
          />
        </div>

        {term ? (
          <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
            {results.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-ink-muted">
                Nothing matches “{term}”.
              </li>
            ) : (
              results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 truncate text-ink">{p.name}</span>
                    <span className="tabular shrink-0 text-xs text-ink-subtle">
                      last {formatMoney(p.purchase_price, ctx)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface-raised">
          {lines.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-ink-muted">
              No items on this bill yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b border-line px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Product
                  </th>
                  <th className="border-b border-line px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Quantity
                  </th>
                  <th className="border-b border-line px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Cost each
                  </th>
                  <th className="border-b border-line px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Total
                  </th>
                  <th className="border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.productId}>
                    <td className="border-b border-line px-4 py-2.5 text-ink last:border-0">
                      {l.name}
                      <span className="ml-1.5 text-xs text-ink-subtle">{l.unitSymbol}</span>
                    </td>
                    <td className="border-b border-line px-3 py-2.5 text-right">
                      <Input
                        value={String(l.quantity)}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          updateLine(i, { quantity: Number.isFinite(q) && q > 0 ? q : l.quantity });
                        }}
                        inputMode="decimal"
                        aria-label={`Quantity of ${l.name}`}
                        className="tabular h-8 w-20 text-right"
                      />
                    </td>
                    <td className="border-b border-line px-3 py-2.5 text-right">
                      <Input
                        value={l.unitCostText}
                        onChange={(e) => updateLine(i, { unitCostText: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Cost of ${l.name}`}
                        className="tabular h-8 w-24 text-right"
                      />
                    </td>
                    <td className="tabular border-b border-line px-4 py-2.5 text-right font-medium text-ink">
                      {formatMoney(
                        toDecimalString(
                          multiply(fromDecimalString(l.unitCostText || "0"), l.quantity),
                        ),
                        ctx,
                      )}
                    </td>
                    <td className="border-b border-line px-2">
                      <button
                        type="button"
                        onClick={() => setLines((c) => c.filter((_, j) => j !== i))}
                        aria-label={`Remove ${l.name}`}
                        className="rounded p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-critical"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-ink">Bill details</h2>

        <div className="space-y-1.5">
          <Label htmlFor="supplierId">Supplier</Label>
          <Select
            id="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9"
          >
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplierInvoice">Their bill number</Label>
          <Input
            id="supplierInvoice"
            value={supplierInvoice}
            onChange={(e) => setSupplierInvoice(e.target.value)}
            placeholder="Optional"
            className="h-9"
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-line p-3">
          <input
            type="checkbox"
            checked={payNow}
            onChange={(e) => setPayNow(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Paid in full</span>
            <span className="block text-[13px] text-ink-muted">
              Untick to add this to what you owe the supplier.
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="tabular text-lg font-semibold text-ink">
            {formatMoney(toDecimalString(total), ctx)}
          </span>
        </div>

        <Button
          onClick={() => void record()}
          disabled={busy || lines.length === 0}
          className="h-11 w-full"
        >
          {busy ? "Recording…" : "Record bill"}
        </Button>
      </div>
    </div>
  );
}
