"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ChevronDown,
  Minus,
  Pencil,
  Plus,
  Scale,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import {
  adjustBalanceAction,
  createAccountAction,
  changeBalanceAction,
  deleteAccountAction,
  renameAccountAction,
  setAccountActiveAction,
  transferAction,
  type AccountFormState,
} from "./account-actions";
import type { AccountSummary } from "./account-queries";

const INITIAL: AccountFormState = {};

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash in hand" },
  { value: "bank", label: "Bank account" },
  { value: "wallet", label: "Digital wallet" },
  { value: "other", label: "Something else" },
] as const;

/** Wraps an action so a success closes the dialog and says so once. */
function useDialogAction(
  action: (prev: AccountFormState, data: FormData) => Promise<AccountFormState>,
  onDone?: () => void,
) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await action(prev, data);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
        onDone?.();
      }
      return result;
    },
    INITIAL,
  );
  return { open, setOpen, state, formAction };
}

export function AddAccountDialog() {
  const { open, setOpen, state, formAction } = useDialogAction(createAccountAction);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add account
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Add an account"
        description="Somewhere your money sits — the drawer, a bank, a wallet."
      >
        <form action={formAction} className="mt-5 space-y-4">
          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <Field
            id="name"
            label="Name"
            placeholder="NIC Asia"
            required
            autoFocus
            error={state.fieldErrors?.name}
          />

          <SelectField
            id="type"
            label="What kind"
            options={ACCOUNT_TYPES}
            defaultValue="bank"
            error={state.fieldErrors?.type}
          />

          <Field
            id="openingBalance"
            label="What is in it now"
            inputMode="decimal"
            defaultValue="0"
            className="tabular"
            hint="Leave at 0 if you are starting from nothing. This becomes its first entry."
            error={state.fieldErrors?.openingBalance}
          />

          <div className="pt-1">
            <SubmitButton>Add account</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  account,
  openingBalance,
}: {
  account: AccountSummary;
  openingBalance: number;
}) {
  const { open, setOpen, state, formAction } = useDialogAction(renameAccountAction);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent title="Edit account" description={account.name}>
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="accountId" value={account.id} />
          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <Field
            id="name"
            label="Name"
            defaultValue={account.name}
            required
            error={state.fieldErrors?.name}
          />
          <SelectField
            id="type"
            label="What kind"
            options={ACCOUNT_TYPES}
            defaultValue={account.type}
            error={state.fieldErrors?.type}
          />
          <Field
            id="openingBalance"
            label="Opening balance"
            inputMode="decimal"
            defaultValue={String(openingBalance)}
            className="tabular"
            hint="What was in the account before you started recording here."
            error={state.fieldErrors?.openingBalance}
          />

          <div className="pt-1">
            <SubmitButton>Save changes</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({
  accounts,
  fromAccountId,
  today,
}: {
  accounts: AccountSummary[];
  fromAccountId?: string;
  today: string;
}) {
  const { open, setOpen, state, formAction } = useDialogAction(transferAction);

  const usable = accounts.filter((a) => a.isActive);
  if (usable.length < 2) return null;

  const options = usable.map((a) => ({ value: a.id, label: a.name }));
  const from = fromAccountId ?? options[0].value;
  const to = options.find((o) => o.value !== from)?.value;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <ArrowLeftRight />
          Move money
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Move money"
        description="Between two of your own accounts. Nothing is earned or spent."
      >
        <form action={formAction} className="mt-5 space-y-4">
          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <SelectField
            id="fromAccount"
            label="Out of"
            options={options}
            defaultValue={from}
            error={state.fieldErrors?.fromAccount}
          />
          <SelectField
            id="toAccount"
            label="Into"
            options={options}
            defaultValue={to}
            error={state.fieldErrors?.toAccount}
          />
          <Field
            id="amount"
            label="Amount"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.amount}
          />
          <Field
            id="movedOn"
            label="When"
            type="date"
            defaultValue={today}
            required
            error={state.fieldErrors?.movedOn}
          />
          <Field id="note" label="Note" placeholder="Optional" />

          <div className="pt-1">
            <SubmitButton>Move it</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CorrectBalanceDialog({ account }: { account: AccountSummary }) {
  const { open, setOpen, state, formAction } = useDialogAction(adjustBalanceAction);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Scale />
          Correct balance
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Correct the balance"
        description="Enter what you actually counted. The difference is recorded as its own entry."
      >
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="accountId" value={account.id} />
          {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

          <div className="rounded-lg bg-surface-sunken px-4 py-3 text-[13px] text-ink-muted">
            The books say this account holds{" "}
            <span className="tabular font-medium text-ink">
              {account.balance.toFixed(2)}
            </span>
            .
          </div>

          <Field
            id="counted"
            label="What you counted"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.counted}
          />
          <Field
            id="note"
            label="Why"
            placeholder="Counted the drawer"
            error={state.fieldErrors?.note}
          />

          <div className="pt-1">
            <SubmitButton>Record the correction</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveAccountButton({ account }: { account: AccountSummary }) {
  const [state, formAction] = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await setAccountActiveAction(prev, data);
      if (result.success) toast.success(result.success);
      if (result.error) toast.error(result.error);
      return result;
    },
    INITIAL,
  );

  // A default account is the one new entries land in, so it stays open.
  if (account.isDefault) return null;

  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="accountId" value={account.id} />
      <input type="hidden" name="isActive" value={account.isActive ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm">
        {account.isActive ? "Close account" : "Reopen"}
      </Button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}

/** Removing the account itself, when it has no history to protect. */
export function DeleteAccountButton({ account }: { account: AccountSummary }) {
  const [state, formAction] = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await deleteAccountAction(prev, data);
      if (result.success) toast.success(result.success);
      if (result.error) toast.error(result.error);
      return result;
    },
    INITIAL,
  );

  if (account.isDefault) return null;

  return (
    <form
      action={formAction}
      className="inline-flex"
      onSubmit={(event) => {
        if (!window.confirm(`Remove ${account.name}?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="accountId" value={account.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-label={`Remove ${account.name}`}
        title="Remove this account"
      >
        <Trash2 />
      </Button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}

/**
 * One way in to everything that changes a balance, so the account header stays
 * quiet: put money in, take it out, move it elsewhere, or correct to a count.
 */
export function AdjustBalanceMenu({
  account,
  accounts,
  today,
}: {
  account: AccountSummary;
  accounts: AccountSummary[];
  today: string;
}) {
  const [openDialog, setOpenDialog] = React.useState<
    "in" | "out" | "transfer" | "correct" | null
  >(null);

  const change = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await changeBalanceAction(prev, data);
      if (result.success) {
        toast.success(result.success);
        setOpenDialog(null);
      }
      return result;
    },
    INITIAL,
  );

  const transfer = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await transferAction(prev, data);
      if (result.success) {
        toast.success(result.success);
        setOpenDialog(null);
      }
      return result;
    },
    INITIAL,
  );

  const correct = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await adjustBalanceAction(prev, data);
      if (result.success) {
        toast.success(result.success);
        setOpenDialog(null);
      }
      return result;
    },
    INITIAL,
  );

  const [changeState, changeAction] = change;
  const [transferState, transferFormAction] = transfer;
  const [correctState, correctAction] = correct;

  const others = accounts.filter((a) => a.isActive && a.id !== account.id);
  const movingIn = openDialog === "in";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Adjust balance
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenDialog("in")}>
            <Plus className="size-4 text-positive" />
            Add money
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenDialog("out")}>
            <Minus className="size-4 text-critical" />
            Take money out
          </DropdownMenuItem>
          {others.length > 0 ? (
            <DropdownMenuItem onSelect={() => setOpenDialog("transfer")}>
              <ArrowLeftRight className="size-4 text-ink-subtle" />
              Move to another account
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpenDialog("correct")}>
            <Scale className="size-4 text-ink-subtle" />
            Correct to a count
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add or take out: the same form, with the direction fixed. */}
      <Dialog
        open={movingIn || openDialog === "out"}
        onOpenChange={(next) => setOpenDialog(next ? openDialog : null)}
      >
        <DialogContent
          title={movingIn ? "Add money" : "Take money out"}
          description={account.name}
        >
          <form action={changeAction} className="mt-5 space-y-4">
            <input type="hidden" name="accountId" value={account.id} />
            <input type="hidden" name="direction" value={movingIn ? "in" : "out"} />

            {changeState.error ? (
              <FormAlert tone="critical">{changeState.error}</FormAlert>
            ) : null}

            <Field
              id="amount"
              label="How much"
              inputMode="decimal"
              required
              autoFocus
              placeholder="0.00"
              className="tabular"
              error={changeState.fieldErrors?.amount}
            />
            <Field
              id="movedOn"
              label="When"
              type="date"
              defaultValue={today}
              required
              error={changeState.fieldErrors?.movedOn}
            />
            <Field
              id="note"
              label="What for"
              placeholder={movingIn ? "Cash deposited" : "Bank charge"}
            />

            <div className="pt-1">
              <SubmitButton>{movingIn ? "Add it" : "Take it out"}</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "transfer"}
        onOpenChange={(next) => setOpenDialog(next ? openDialog : null)}
      >
        <DialogContent
          title="Move money"
          description="Between two of your own accounts. Nothing is earned or spent."
        >
          <form action={transferFormAction} className="mt-5 space-y-4">
            {transferState.error ? (
              <FormAlert tone="critical">{transferState.error}</FormAlert>
            ) : null}

            <SelectField
              id="fromAccount"
              label="Out of"
              options={accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: a.name }))}
              defaultValue={account.id}
              error={transferState.fieldErrors?.fromAccount}
            />
            <SelectField
              id="toAccount"
              label="Into"
              options={others.map((a) => ({ value: a.id, label: a.name }))}
              defaultValue={others[0]?.id}
              error={transferState.fieldErrors?.toAccount}
            />
            <Field
              id="amount"
              label="Amount"
              inputMode="decimal"
              required
              autoFocus
              placeholder="0.00"
              className="tabular"
              error={transferState.fieldErrors?.amount}
            />
            <Field
              id="movedOn"
              label="When"
              type="date"
              defaultValue={today}
              required
              error={transferState.fieldErrors?.movedOn}
            />
            <Field id="note" label="Note" placeholder="Optional" />

            <div className="pt-1">
              <SubmitButton>Move it</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "correct"}
        onOpenChange={(next) => setOpenDialog(next ? openDialog : null)}
      >
        <DialogContent
          title="Correct to a count"
          description="Enter what you actually counted. The difference is recorded as its own entry."
        >
          <form action={correctAction} className="mt-5 space-y-4">
            <input type="hidden" name="accountId" value={account.id} />
            {correctState.error ? (
              <FormAlert tone="critical">{correctState.error}</FormAlert>
            ) : null}

            <div className="rounded-lg bg-surface-sunken px-4 py-3 text-[13px] text-ink-muted">
              The books say this account holds{" "}
              <span className="tabular font-medium text-ink">
                {account.balance.toFixed(2)}
              </span>
              .
            </div>

            <Field
              id="counted"
              label="What you counted"
              inputMode="decimal"
              required
              autoFocus
              placeholder="0.00"
              className="tabular"
              error={correctState.fieldErrors?.counted}
            />
            <Field id="note" label="Why" placeholder="Counted the drawer" />

            <div className="pt-1">
              <SubmitButton>Record the correction</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
