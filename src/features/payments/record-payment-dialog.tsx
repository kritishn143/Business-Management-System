"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { SelectField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { recordPaymentAction, type PartyFormState } from "@/features/parties/actions";
import type { PartyChoice } from "./queries";

const INITIAL: PartyFormState = {};

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "qr", label: "QR" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
] as const;

const DIRECTIONS = [
  { value: "in", label: "Received from a customer" },
  { value: "out", label: "Paid to a supplier" },
] as const;

/**
 * The party-page dialog already knows who is paying; this one does not, so it
 * asks. Same action, same validation, same RPC (SPEC §91).
 */
export function RecordPaymentDialog({ parties }: { parties: PartyChoice[] }) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState(
    async (prev: PartyFormState, formData: FormData) => {
      const result = await recordPaymentAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  if (parties.length === 0) {
    return (
      <Button asChild variant="secondary">
        <Link href="/customers">Add a customer first</Link>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Record payment
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Record a payment"
        description="Against a customer's or supplier's account."
      >
        <form action={formAction} className="mt-5 space-y-4">
          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <SelectField
            id="direction"
            label="Which way is the money going"
            options={DIRECTIONS}
            defaultValue="in"
            error={state.fieldErrors?.direction}
          />

          <SelectField
            id="partyId"
            label="Who"
            options={parties.map((p) => ({ value: p.id, label: p.name }))}
            error={state.fieldErrors?.partyId}
          />

          <Field
            id="amount"
            label="Amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.amount}
          />

          <SelectField
            id="method"
            label="Method"
            options={METHODS}
            defaultValue="cash"
            error={state.fieldErrors?.method}
          />

          <Field id="notes" label="Note" placeholder="Optional" />

          <div className="pt-1">
            <SubmitButton>Record payment</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
