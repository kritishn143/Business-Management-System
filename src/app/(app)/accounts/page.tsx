import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Landmark, Wallet } from "lucide-react";
import { MoneyNav } from "@/features/money/money-nav";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import {
  listAccountLedger,
  listAccounts,
  type AccountSummary,
} from "@/features/money/account-queries";
import {
  AddAccountDialog,
  AdjustBalanceMenu,
  ArchiveAccountButton,
  DeleteAccountButton,
  EditAccountDialog,
} from "@/features/money/account-forms";
import { LedgerFilters } from "@/features/money/ledger-filters";
import { formatMoney, formatPlainDate, localCalendarDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/types/database";

export const metadata: Metadata = { title: "Accounts" };

const ICONS: Record<AccountType, typeof Wallet> = {
  cash: Banknote,
  bank: Landmark,
  wallet: Wallet,
  other: Wallet,
};

const TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  wallet: "Wallet",
  other: "Other",
};

const KIND: Record<string, { label: string; tone: "neutral" | "positive" | "caution" }> = {
  opening: { label: "Opening", tone: "neutral" },
  income: { label: "Income", tone: "positive" },
  expense: { label: "Expense", tone: "caution" },
  transfer_in: { label: "Moved in", tone: "positive" },
  transfer_out: { label: "Moved out", tone: "caution" },
  adjustment: { label: "Correction", tone: "neutral" },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

export default async function AccountsPage({
  searchParams,
}: PageProps<"/accounts">) {
  const params = await searchParams;

  const [accounts, { business }] = await Promise.all([
    listAccounts(),
    loadActiveBusiness(),
  ]);

  const ctx = formatContextOf(business);
  const today = localCalendarDate(new Date().toISOString(), business.timezone);

  // The account being looked at, defaulting to the first one.
  const requested = one(params.account);
  const selected: AccountSummary | undefined =
    accounts.find((a) => a.id === requested) ?? accounts[0];

  const search = one(params.q);
  const kind = one(params.kind);
  const order = one(params.order) || "newest";

  const [ledger, openingRow] = selected
    ? await Promise.all([
        listAccountLedger(selected.id, { search, kind, order }),
        (await createClient())
          .from("accounts")
          .select("opening_balance")
          .eq("id", selected.id)
          .maybeSingle(),
      ])
    : [[], { data: null }];

  const total = accounts
    .filter((a) => a.isActive)
    .reduce((sum, a) => sum + a.balance, 0);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <MoneyNav current="accounts" />
        <div className="mt-8">
          <EmptyState
            icon={Landmark}
            title="No accounts yet"
            description="Add the cash drawer, your bank, or a wallet, so expenses and income have somewhere to come from."
            action={<AddAccountDialog />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <MoneyNav current="accounts" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[19rem_1fr] lg:items-start">
        {/* Every account stays in view, so switching between them is one click. */}
        <aside className="overflow-hidden rounded-xl border border-line bg-surface-raised lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h1 className="text-sm font-semibold text-ink">
              Accounts
              <span className="ml-1.5 font-normal text-ink-subtle">
                {accounts.length}
              </span>
            </h1>
            <AddAccountDialog />
          </div>

          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] text-ink-muted">Total</span>
            <span
              className={
                "tabular text-base font-semibold " +
                (total < 0 ? "text-critical" : "text-ink")
              }
            >
              {formatMoney(total.toFixed(2), ctx)}
            </span>
          </div>

          <ul>
            {accounts.map((account) => {
              const Icon = ICONS[account.type];
              const active = account.id === selected?.id;
              return (
                <li key={account.id}>
                  <Link
                    href={`/accounts?account=${account.id}`}
                    aria-current={active ? "true" : undefined}
                    className={
                      "flex items-center gap-3 border-b border-line px-4 py-3 text-sm transition-colors last:border-0 " +
                      (active
                        ? "bg-accent-wash text-ink"
                        : "text-ink hover:bg-surface-sunken")
                    }
                  >
                    <Icon
                      className={
                        "size-4 shrink-0 " +
                        (active ? "text-accent" : "text-ink-subtle")
                      }
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {account.name}
                      {!account.isActive ? (
                        <span className="ml-1.5 text-xs text-caution">closed</span>
                      ) : null}
                    </span>
                    <span
                      className={
                        "tabular shrink-0 text-[13px] " +
                        (account.balance < 0 ? "text-critical" : "text-ink-muted")
                      }
                    >
                      {formatMoney(account.balance.toFixed(2), ctx)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        {selected ? (
          <section className="min-w-0">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-ink">
                    {selected.name}
                  </h2>
                  <Badge tone="neutral">{TYPE_LABEL[selected.type]}</Badge>
                  {selected.isDefault ? <Badge tone="neutral">Default</Badge> : null}
                  {!selected.isActive ? <Badge tone="caution">Closed</Badge> : null}
                </div>
                <p
                  className={
                    "tabular mt-1 text-3xl font-semibold tracking-tight " +
                    (selected.balance < 0 ? "text-critical" : "text-ink")
                  }
                >
                  {formatMoney(selected.balance.toFixed(2), ctx)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  what this account holds now
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <EditAccountDialog
                  account={selected}
                  openingBalance={Number(openingRow.data?.opening_balance ?? 0)}
                />
                <ArchiveAccountButton account={selected} />
                <DeleteAccountButton account={selected} />
                <AdjustBalanceMenu
                  account={selected}
                  accounts={accounts}
                  today={today}
                />
              </div>
            </div>

            <LedgerFilters search={search} kind={kind} order={order} />

            {ledger.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={
                  search || kind ? "Nothing matches that" : "Nothing has moved yet"
                }
                description={
                  search || kind
                    ? "Try a different search, or show everything again."
                    : "Expenses paid from this account, income paid into it, and transfers all appear here."
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>What</Th>
                      <Th className="text-right">In</Th>
                      <Th className="text-right">Out</Th>
                      <Th className="text-right">Balance</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => {
                      const kindLabel = KIND[row.kind] ?? {
                        label: row.kind,
                        tone: "neutral" as const,
                      };
                      return (
                        <Tr key={`${row.kind}-${row.referenceId}`}>
                          <Td className="whitespace-nowrap text-ink-muted">
                            {formatPlainDate(row.movedOn, ctx)}
                          </Td>
                          <Td>
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge tone={row.undone ? "neutral" : kindLabel.tone}>
                                {kindLabel.label}
                              </Badge>
                              <span className={row.undone ? "text-ink-subtle" : "text-ink"}>
                                {row.description}
                              </span>
                              {row.undone ? (
                                <span className="text-[13px] text-ink-subtle">
                                  · taken back
                                </span>
                              ) : null}
                            </span>
                          </Td>
                          {/* A taken-back entry keeps its figures, struck through,
                              so the history still says what was done. */}
                          <Td
                            className={
                              "tabular whitespace-nowrap text-right " +
                              (row.undone ? "text-ink-subtle line-through" : "text-positive")
                            }
                          >
                            {row.moneyIn > 0
                              ? formatMoney(row.moneyIn.toFixed(2), ctx)
                              : "—"}
                          </Td>
                          <Td
                            className={
                              "tabular whitespace-nowrap text-right " +
                              (row.undone ? "text-ink-subtle line-through" : "text-critical")
                            }
                          >
                            {row.moneyOut > 0
                              ? formatMoney(row.moneyOut.toFixed(2), ctx)
                              : "—"}
                          </Td>
                          <Td className="tabular whitespace-nowrap text-right font-medium">
                            {row.undone
                              ? "—"
                              : formatMoney(row.runningBalance.toFixed(2), ctx)}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}

            <p className="mt-4 text-[13px] text-ink-subtle">
              The balance is worked out from these entries every time you look, so
              it cannot drift away from them. An entry can be taken back, and put
              back, for a week from{" "}
              <Link href="/settings/activity" className="text-accent hover:underline">
                the activity log
              </Link>
              , where every change is recorded.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
