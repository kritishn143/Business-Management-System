"use client";

import * as React from "react";
import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert, SubmitButton } from "@/features/auth/form-parts";
import {
  createPartyAction,
  recordPaymentAction,
  type PartyFormState,
} from "./actions";

const INITIAL: PartyFormState = {};

function TextField({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <p className="text-[13px] text-critical">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function AddPartyDialog({ kind }: { kind: "customer" | "supplier" }) {
  const [open, setOpen] = React.useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState(
    async (prev: PartyFormState, formData: FormData) => {
      const result = await createPartyAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  const noun = kind === "customer" ? "customer" : "supplier";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add {noun}
        </Button>
      </DialogTrigger>

      <DialogContent title={`Add a ${noun}`}>
        <form ref={formRef} action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="kind" value={kind} />

          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <TextField
            id="name"
            label="Name"
            required
            autoFocus
            error={state.fieldErrors?.name}
          />
          <TextField
            id="phone"
            label="Phone"
            type="tel"
            placeholder="Optional"
            error={state.fieldErrors?.phone}
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            placeholder="Optional"
            error={state.fieldErrors?.email}
          />
          <TextField
            id="address"
            label="Address"
            placeholder="Optional"
            error={state.fieldErrors?.address}
          />
          <TextField
            id="openingBalance"
            label={kind === "customer" ? "They already owe" : "You already owe"}
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            hint="Leave at 0 if you're starting fresh."
            error={state.fieldErrors?.openingBalance}
          />

          <div className="pt-1">
            <SubmitButton>Save {noun}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordPaymentDialog({
  partyId,
  partyName,
  kind,
}: {
  partyId: string;
  partyName: string;
  kind: "customer" | "supplier";
}) {
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

  const direction = kind === "customer" ? "in" : "out";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Record payment</Button>
      </DialogTrigger>

      <DialogContent
        title={kind === "customer" ? "Record a payment received" : "Record a payment made"}
        description={partyName}
      >
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="partyId" value={partyId} />
          <input type="hidden" name="direction" value={direction} />

          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <TextField
            id="amount"
            label="Amount"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.amount}
          />

          <div className="space-y-1.5">
            <Label htmlFor="method">Method</Label>
            <Select id="method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="qr">QR</option>
              <option value="bank">Bank transfer</option>
              <option value="card">Card</option>
              <option value="wallet">Wallet</option>
              <option value="other">Other</option>
            </Select>
          </div>

          <TextField id="notes" label="Note" placeholder="Optional" />

          <div className="pt-1">
            <SubmitButton>Record payment</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
