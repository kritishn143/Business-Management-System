"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuantity } from "@/lib/format";
import { createSaleReturnAction } from "./return-actions";
import type { SaleItemRow } from "./queries";

export function ReturnDialog({
  saleId,
  items,
  numberFormat,
}: {
  saleId: string;
  items: SaleItemRow[];
  numberFormat: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [txnId, setTxnId] = React.useState(() => crypto.randomUUID());

  // Only lines with something left to come back can be returned.
  const returnable = items.filter((i) => Number(i.quantity) - i.returned > 0);

  async function submit() {
    const chosen = returnable
      .map((i) => ({ saleItemId: i.id, quantity: Number(quantities[i.id] ?? 0) }))
      .filter((i) => i.quantity > 0);

    if (chosen.length === 0) {
      toast.error("Enter a quantity for at least one item.");
      return;
    }

    for (const line of chosen) {
      const item = returnable.find((i) => i.id === line.saleItemId);
      const remaining = item ? Number(item.quantity) - item.returned : 0;
      if (line.quantity > remaining) {
        toast.error(
          `Only ${formatQuantity(remaining, numberFormat)} of ${item?.product?.name ?? "that item"} can still be returned.`,
        );
        return;
      }
    }

    setBusy(true);
    const result = await createSaleReturnAction({
      saleId,
      items: chosen,
      reason: reason.trim() || null,
      clientTransactionId: txnId,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Return ${result.returnNumber} recorded`);
    setOpen(false);
    setQuantities({});
    setReason("");
    setTxnId(crypto.randomUUID());
    router.refresh();
  }

  if (returnable.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Undo2 />
          Accept a return
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Accept a return"
        description="Enter how many of each item are coming back. Stock and the customer's account update together."
      >
        <div className="mt-5 space-y-3">
          {returnable.map((i) => {
            const remaining = Number(i.quantity) - i.returned;
            return (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {i.product?.name ?? "Deleted product"}
                  </span>
                  <span className="block text-xs text-ink-subtle">
                    {formatQuantity(remaining, numberFormat)} of{" "}
                    {formatQuantity(i.quantity, numberFormat)} can come back
                  </span>
                </span>
                <Input
                  value={quantities[i.id] ?? ""}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [i.id]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`Quantity of ${i.product?.name ?? "item"} to return`}
                  className="tabular h-8 w-20 shrink-0 text-right"
                />
              </div>
            );
          })}

          <div className="space-y-1.5 pt-1">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged, wrong item, changed mind…"
            />
          </div>

          <Button onClick={() => void submit()} disabled={busy} className="w-full">
            {busy ? "Recording…" : "Record return"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
