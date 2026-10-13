"use client";

import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/features/auth/form-parts";
import { createUnitAction, type CatalogFormState } from "./actions";

const INITIAL: CatalogFormState = {};

export function UnitForm({
  baseUnits,
}: {
  baseUnits: { id: string; name: string; symbol: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: CatalogFormState, formData: FormData) => {
      const result = await createUnitAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        formRef.current?.reset();
      }
      return result;
    },
    INITIAL,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Unit name</Label>
          <Input id="name" name="name" placeholder="e.g. Ream" required />
          {state.fieldErrors?.name ? (
            <p className="text-[13px] text-critical">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="symbol">Short symbol</Label>
          <Input id="symbol" name="symbol" placeholder="e.g. rm" required />
          {state.fieldErrors?.symbol ? (
            <p className="text-[13px] text-critical">{state.fieldErrors.symbol}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="baseUnitId">Converts into</Label>
          <Select id="baseUnitId" name="baseUnitId" defaultValue="">
            <option value="">Nothing — this is a base unit</option>
            {baseUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="conversionFactor">How many</Label>
          <Input
            id="conversionFactor"
            name="conversionFactor"
            inputMode="decimal"
            defaultValue="1"
            className="tabular"
          />
          {state.fieldErrors?.conversionFactor ? (
            <p className="text-[13px] text-critical">
              {state.fieldErrors.conversionFactor}
            </p>
          ) : (
            <p className="text-[13px] text-ink-subtle">
              A ream of 500 sheets converts into Piece at 500.
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add unit"}
      </Button>
    </form>
  );
}
