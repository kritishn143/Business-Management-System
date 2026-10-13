import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatMoney, formatPlainDate } from "@/lib/format";
import { MoneyNav } from "./money-nav";
import {
  DeleteMoneyButton,
  EditMoneyDialog,
  RecordMoneyDialog,
} from "./money-form";
import { listMoneyEntries, loadMoneyOptions, type MoneyKind } from "./queries";

const COPY = {
  expense: {
    title: "Expenses",
    description: "Rent, electricity, salaries — everything going out.",
    emptyTitle: "No expenses recorded",
    emptyBody:
      "Record what the shop spends, so your profit reflects the real cost of running it, not just stock.",
    totalLabel: "Spent",
    accountLabel: "Paid from",
  },
  income: {
    title: "Other income",
    description: "Money in that isn't a sale — commission, services, odds and ends.",
    emptyTitle: "No other income recorded",
    emptyBody:
      "Record income that doesn't come from selling stock, like photocopying or commission.",
    totalLabel: "Received",
    accountLabel: "Paid into",
  },
} as const;

export async function MoneyPage({ kind }: { kind: MoneyKind }) {
  const [entries, options, memberships] = await Promise.all([
    listMoneyEntries(kind),
    loadMoneyOptions(kind),
    listMemberships(),
  ]);

  const business = memberships[0].business;
  const ctx = formatContextOf(business);

  // Today in the shop's own timezone, not the server's.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: business.timezone,
  }).format(new Date());

  const copy = COPY[kind];
  const total = entries.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <MoneyNav current={kind === "expense" ? "expenses" : "income"} />

      <div className="mt-6" />
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<RecordMoneyDialog kind={kind} options={options} today={today} />}
      />

      {entries.length === 0 ? (
        <EmptyState icon={Wallet} title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <>
          <div className="mb-5 inline-flex items-baseline gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3">
            <span className="text-[13px] text-ink-muted">{copy.totalLabel}</span>
            <span className="tabular text-lg font-semibold text-ink">
              {formatMoney(total, ctx)}
            </span>
            <span className="text-xs text-ink-subtle">
              across {entries.length} {entries.length === 1 ? "record" : "records"}
            </span>
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>{copy.accountLabel}</Th>
                  <Th>Note</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="w-20 text-right">
                    <span className="sr-only">Edit or remove</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {formatPlainDate(e.entry_date, ctx)}
                    </Td>
                    <Td>{e.category?.name ?? "Uncategorised"}</Td>
                    <Td className="text-ink-muted">{e.account?.name ?? "—"}</Td>
                    <Td className="text-ink-muted">{e.description ?? "—"}</Td>
                    <Td className="tabular text-right font-medium">
                      {formatMoney(e.amount, ctx)}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <EditMoneyDialog
                        kind={kind}
                        entry={e}
                        options={options}
                        today={today}
                      />
                      <DeleteMoneyButton kind={kind} entry={e} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </div>
  );
}
