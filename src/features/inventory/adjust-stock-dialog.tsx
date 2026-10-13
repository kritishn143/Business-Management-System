"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { adjustStockAction, type AdjustStockState } from "./actions";
import { ADJUSTMENT_REASONS } from "./schemas";

const INITIAL: AdjustStockState = {};

export function AdjustStockDialog({
  productId,
  productName,
  unitSymbol,
  currentQuantity,
}: {
  productId: string;
  productName: string;
  unitSymbol: string;
  currentQuantity: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Close and confirm inside the action itself — no effect, so there is no
  // render-then-correct cascade and no stale-success reopen.
  const [state, formAction] = useActionState(
    async (prev: AdjustStockState, formData: FormData) => {
      const result = await adjustStockAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <SlidersHorizontal />
          Adjust stock
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Adjust stock"
        description={`${productName} — currently ${currentQuantity} ${unitSymbol}`}
      >
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="productId" value={productId} />

          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="direction">Direction</Label>
              <Select id="direction" name="direction" defaultValue="increase">
                <option value="increase">Add stock</option>
                <option value="decrease">Remove stock</option>
              </Select>
              {state.fieldErrors?.direction ? (
                <p className="text-[13px] text-critical">{state.fieldErrors.direction}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                inputMode="decimal"
                placeholder="0"
                required
                className="tabular"
                aria-invalid={state.fieldErrors?.quantity ? true : undefined}
              />
              {state.fieldErrors?.quantity ? (
                <p className="text-[13px] text-critical">{state.fieldErrors.quantity}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Select id="reason" name="reason" defaultValue="physical_count" required>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </Select>
            <p className="text-[13px] text-ink-subtle">
              Every adjustment is recorded permanently against this product.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Note</Label>
            <Input id="notes" name="notes" placeholder="Optional" />
            {state.fieldErrors?.notes ? (
              <p className="text-[13px] text-critical">{state.fieldErrors.notes}</p>
            ) : null}
          </div>

          <div className="pt-1">
            <SubmitButton>Record adjustment</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
