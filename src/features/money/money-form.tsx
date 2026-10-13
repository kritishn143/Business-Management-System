"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert, SubmitButton } from "@/features/auth/form-parts";
import {
  deleteMoneyEntryAction,
  recordMoneyEntryAction,
  updateMoneyEntryAction,
  type MoneyFormState,
} from "./actions";
import type { MoneyEntry, MoneyKind, MoneyOptions } from "./types";

const INITIAL: MoneyFormState = {};

/**
 * The same fields whether a record is being created or corrected, so the two
 * can never drift apart.
 */
function EntryFields({
  kind,
  options,
  state,
  entry,
  today,
}: {
  kind: MoneyKind;
  options: MoneyOptions;
  state: MoneyFormState;
  entry?: MoneyEntry;
  today: string;
}) {
  const defaultAccount = options.accounts.find((a) => a.is_default) ?? options.accounts[0];

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          autoFocus
          defaultValue={entry?.amount ?? ""}
          className="tabular"
          aria-invalid={state.fieldErrors?.amount ? true : undefined}
        />
        {state.fieldErrors?.amount ? (
          <p className="text-[13px] text-critical">{state.fieldErrors.amount}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Category</Label>
          <Select
            id="categoryId"
            name="categoryId"
            defaultValue={entry?.categoryId ?? ""}
          >
            <option value="">Uncategorised</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="accountId">
            {kind === "expense" ? "Paid from" : "Paid into"}
          </Label>
          <Select
            id="accountId"
            name="accountId"
            defaultValue={entry ? (entry.accountId ?? "") : (defaultAccount?.id ?? "")}
          >
            <option value="">Not specified</option>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="entryDate">Date</Label>
        <Input
          id="entryDate"
          name="entryDate"
          type="date"
          defaultValue={entry?.entry_date ?? today}
          required
        />
        {state.fieldErrors?.entryDate ? (
          <p className="text-[13px] text-critical">{state.fieldErrors.entryDate}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Note</Label>
        <Input
          id="description"
          name="description"
          placeholder="Optional"
          defaultValue={entry?.description ?? ""}
        />
      </div>
    </>
  );
}

export function RecordMoneyDialog({
  kind,
  options,
  today,
}: {
  kind: MoneyKind;
  options: MoneyOptions;
  /** Passed from the server so the date matches the shop's timezone. */
  today: string;
}) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState(
    async (prev: MoneyFormState, formData: FormData) => {
      const result = await recordMoneyEntryAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  const noun = kind === "expense" ? "expense" : "income";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Record {noun}
        </Button>
      </DialogTrigger>

      <DialogContent title={`Record ${noun}`}>
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="kind" value={kind} />

          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <EntryFields kind={kind} options={options} state={state} today={today} />

          <div className="pt-1">
            <SubmitButton>Save {noun}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditMoneyDialog({
  kind,
  entry,
  options,
  today,
}: {
  kind: MoneyKind;
  entry: MoneyEntry;
  options: MoneyOptions;
  today: string;
}) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState(
    async (prev: MoneyFormState, formData: FormData) => {
      const result = await updateMoneyEntryAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  const noun = kind === "expense" ? "expense" : "income";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Edit this ${noun}`}
          title="Edit"
          className="inline-flex rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <Pencil className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent
        title={`Edit ${noun}`}
        description="Correcting a record changes the account balance with it."
      >
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="entryId" value={entry.id} />

          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <EntryFields
            kind={kind}
            options={options}
            state={state}
            entry={entry}
            today={today}
          />

          <div className="pt-1">
            <SubmitButton>Save changes</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteMoneyButton({
  kind,
  entry,
}: {
  kind: MoneyKind;
  entry: MoneyEntry;
}) {
  const [state, formAction] = useActionState(
    async (prev: MoneyFormState, formData: FormData) => {
      const result = await deleteMoneyEntryAction(prev, formData);
      if (result.success) toast.success(result.success);
      if (result.error) toast.error(result.error);
      return result;
    },
    INITIAL,
  );

  const noun = kind === "expense" ? "expense" : "income record";

  return (
    <form
      action={formAction}
      className="inline-flex"
      onSubmit={(event) => {
        if (!window.confirm(`Remove this ${noun}?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryId" value={entry.id} />
      <button
        type="submit"
        aria-label={`Remove this ${noun}`}
        title="Remove"
        className="inline-flex rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-critical-wash hover:text-critical"
      >
        <Trash2 className="size-4" />
      </button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}
