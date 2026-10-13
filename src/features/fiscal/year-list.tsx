"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/form-parts";
import { formatMoney, formatPlainDate, type FormatContext } from "@/lib/format";
import {
  closeFiscalYearAction,
  reopenFiscalYearAction,
  type FiscalActionState,
} from "./actions";
import type { FiscalYear } from "./queries";
import { closableYear } from "./rules";

const INITIAL: FiscalActionState = {};

function SubmitLink({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function FiscalYearList({
  years,
  ctx,
  today,
  canClose,
  canReopen,
}: {
  today: string;
  years: FiscalYear[];
  ctx: FormatContext;
  canClose: boolean;
  canReopen: boolean;
}) {
  const [closeState, close] = useActionState(closeFiscalYearAction, INITIAL);
  const [reopenState, reopen] = useActionState(reopenFiscalYearAction, INITIAL);

  const error = closeState.error ?? reopenState.error;
  const success = closeState.success ?? reopenState.success;

  // Only the oldest finished open year may be closed, which the database
  // enforces too.
  const oldestOpen = closableYear(years, today);

  return (
    <div className="space-y-4">
      {error ? <FormAlert tone="critical">{error}</FormAlert> : null}
      {success ? <FormAlert tone="positive">{success}</FormAlert> : null}

      <ul className="space-y-3">
        {years.map((year) => (
          <li
            key={year.id}
            className="rounded-xl border border-line bg-surface-raised px-5 py-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-base font-semibold text-ink">{year.name}</h2>
                  {year.status === "closed" ? (
                    <Badge tone="neutral">Closed</Badge>
                  ) : year.current ? (
                    <Badge tone="positive">In progress</Badge>
                  ) : year.ended ? (
                    <Badge tone="caution">Ready to close</Badge>
                  ) : (
                    <Badge tone="neutral">Not started</Badge>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {formatPlainDate(year.startsOn, ctx)} to{" "}
                  {formatPlainDate(year.endsOn, ctx)}
                </p>
              </div>

              {year.status === "open" && canClose && year.id === oldestOpen?.id ? (
                <form action={close}>
                  <input type="hidden" name="fiscalYearId" value={year.id} />
                  <SubmitLink>Close this year</SubmitLink>
                </form>
              ) : year.status === "closed" && canReopen ? (
                <form action={reopen}>
                  <input type="hidden" name="fiscalYearId" value={year.id} />
                  <SubmitLink>Reopen</SubmitLink>
                </form>
              ) : null}
            </div>

            {year.closing ? (
              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle">
                    Owed to the shop
                  </dt>
                  <dd className="tabular mt-1 text-sm text-ink">
                    {formatMoney(year.closing.parties.toFixed(2), ctx)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle">
                    Stock at cost
                  </dt>
                  <dd className="tabular mt-1 text-sm text-ink">
                    {formatMoney(year.closing.stockValue.toFixed(2), ctx)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle">
                    In the accounts
                  </dt>
                  <dd className="tabular mt-1 text-sm text-ink">
                    {formatMoney(year.closing.accounts.toFixed(2), ctx)}
                  </dd>
                </div>
              </dl>
            ) : null}

            {year.status === "open" && year.ended && year.id !== oldestOpen?.id ? (
              <p className="mt-3 text-[13px] text-ink-subtle">
                Close {oldestOpen?.name} first — a year&rsquo;s opening position comes
                from the one before it.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
