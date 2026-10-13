import Link from "next/link";
import { ArrowLeft, HandCoins } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { AGEING_BUCKETS } from "@/domain/finance/ageing";
import { toDecimalString } from "@/domain/money/decimal";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { formatMoney, formatPlainDate } from "@/lib/format";
import { loadAgeingReport } from "./ageing";

const COPY = {
  receivable: {
    title: "Receivables",
    description: "Who owes you, and how long they have owed it.",
    who: "Customer",
    total: "Total owed to you",
    href: "/customers",
    empty: "Nobody owes you anything",
    emptyHint:
      "Credit sales appear here as soon as a customer takes goods without paying in full.",
    advance: "in advance",
  },
  payable: {
    title: "Payables",
    description: "Whom you owe, and how long you have owed it.",
    who: "Supplier",
    total: "Total you owe",
    href: "/suppliers",
    empty: "You owe nobody anything",
    emptyHint: "Unpaid purchase bills appear here until they are settled.",
    advance: "paid ahead",
  },
} as const;

/**
 * Receivables and payables are the same report read from opposite ends, so
 * they share one implementation (SPEC §20, §46).
 */
export async function AgeingReportPage({ kind }: { kind: "receivable" | "payable" }) {
  const copy = COPY[kind];
  const { business } = await loadActiveBusiness();
  const ctx = formatContextOf(business);
  const report = await loadAgeingReport({ kind, timezone: business.timezone });

  const overdue = report.totals.d30 + report.totals.d60 + report.totals.d90;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink print:hidden"
      >
        <ArrowLeft className="size-4" />
        Reports
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">
          {copy.title}
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          {copy.description} As at {formatPlainDate(report.asOf, ctx)}.
        </p>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState icon={HandCoins} title={copy.empty} description={copy.emptyHint} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">{copy.total}</p>
                <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  {formatMoney(toDecimalString(report.totals.balance), ctx)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  across {report.rows.length}{" "}
                  {report.rows.length === 1 ? "account" : "accounts"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">Past 30 days</p>
                <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  {formatMoney(toDecimalString(overdue), ctx)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {overdue > 0 ? "Worth a phone call" : "Nothing has aged yet"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">Over 90 days</p>
                <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  {formatMoney(toDecimalString(report.totals.d90), ctx)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {report.totals.d90 > 0 ? "At risk" : "Clear"}
                </p>
              </CardContent>
            </Card>
          </div>

          <TableWrap className="mt-8">
            <Table>
              <thead>
                <tr>
                  <Th>{copy.who}</Th>
                  {AGEING_BUCKETS.map((b) => (
                    <Th key={b.key} className="text-right">
                      {b.label}
                    </Th>
                  ))}
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <Tr key={row.partyId}>
                    <Td>
                      <Link
                        href={`${copy.href}/${row.partyId}`}
                        className="font-medium text-ink hover:text-accent hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.ageing.oldestDays !== null ? (
                        <span className="ml-2 text-[13px] text-ink-subtle">
                          oldest {row.ageing.oldestDays}d
                        </span>
                      ) : null}
                      {row.ageing.unapplied > 0 ? (
                        <span className="ml-2 text-[13px] text-positive">
                          {formatMoney(toDecimalString(row.ageing.unapplied), ctx)}{" "}
                          {copy.advance}
                        </span>
                      ) : null}
                    </Td>
                    {AGEING_BUCKETS.map((b) => {
                      const amount = row.ageing.buckets[b.key];
                      return (
                        <Td
                          key={b.key}
                          className={
                            "tabular text-right " +
                            (amount === 0
                              ? "text-ink-subtle"
                              : b.key === "d90"
                                ? "text-critical"
                                : "text-ink-muted")
                          }
                        >
                          {amount === 0
                            ? "—"
                            : formatMoney(toDecimalString(amount), ctx)}
                        </Td>
                      );
                    })}
                    <Td className="tabular text-right font-medium">
                      {formatMoney(toDecimalString(row.ageing.balance), ctx)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td className="font-medium">Total</Td>
                  {AGEING_BUCKETS.map((b) => (
                    <Td key={b.key} className="tabular text-right text-ink-muted">
                      {formatMoney(toDecimalString(report.totals[b.key]), ctx)}
                    </Td>
                  ))}
                  <Td className="tabular text-right font-semibold">
                    {formatMoney(toDecimalString(report.totals.balance), ctx)}
                  </Td>
                </tr>
              </tfoot>
            </Table>
          </TableWrap>

          <p className="mt-4 text-[13px] text-ink-subtle">
            Payments are recorded against the account rather than a single
            invoice, so each one is applied to the oldest outstanding amount
            first.
          </p>
        </>
      )}
    </div>
  );
}
