import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { toDecimalString } from "@/domain/money/decimal";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { loadPurchasesReport } from "@/features/reports/purchases";
import { RANGE_PRESETS, resolveRange } from "@/features/reports/queries";
import { formatMoney, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Purchases report" };

export default async function PurchasesReportPage({
  searchParams,
}: PageProps<"/reports/purchases">) {
  const params = await searchParams;
  const preset = typeof params.range === "string" ? params.range : "month";

  const { business } = await loadActiveBusiness();
  const ctx = formatContextOf(business);
  const range = resolveRange(preset, business.timezone);
  const report = await loadPurchasesReport(range);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink print:hidden"
      >
        <ArrowLeft className="size-4" />
        Reports
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">Purchases</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {range.label} · {range.from} to {range.to}
          </p>
        </div>

        <nav aria-label="Date range" className="flex flex-wrap gap-1.5 print:hidden">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.value}
              href={`/reports/purchases?range=${p.value}`}
              aria-current={p.value === preset ? "page" : undefined}
              className={
                "rounded-md px-3 py-1.5 text-[13px] transition-colors " +
                (p.value === preset
                  ? "bg-accent-wash font-medium text-accent"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink")
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {report.billCount === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchases in this period"
          description="Pick a wider date range, or record a purchase to see it here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Bought",
                value: report.total,
                hint: `${report.billCount} ${report.billCount === 1 ? "bill" : "bills"}`,
              },
              { label: "Paid", value: report.paid, hint: "Settled so far" },
              { label: "Still owing", value: report.owing, hint: "Across these bills" },
              { label: "Returned", value: report.returned, hint: "Sent back to suppliers" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-6">
                  <p className="text-[13px] text-ink-muted">{stat.label}</p>
                  <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
                    {formatMoney(toDecimalString(stat.value), ctx)}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <h2 className="mt-10 mb-4 text-base font-semibold text-ink">By supplier</h2>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Supplier</Th>
                  <Th className="text-right">Bills</Th>
                  <Th className="text-right">Bought</Th>
                  <Th className="text-right">Owing</Th>
                </tr>
              </thead>
              <tbody>
                {report.bySupplier.map((s) => (
                  <Tr key={s.name}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td className="tabular text-right text-ink-muted">{s.bills}</Td>
                    <Td className="tabular text-right">
                      {formatMoney(toDecimalString(s.total), ctx)}
                    </Td>
                    <Td className="tabular text-right">
                      {s.owing > 0 ? (
                        <span className="text-critical">
                          {formatMoney(toDecimalString(s.owing), ctx)}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <h2 className="mt-10 mb-4 text-base font-semibold text-ink">By product</h2>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Bought</Th>
                  <Th className="text-right">Cost</Th>
                </tr>
              </thead>
              <tbody>
                {report.byProduct.map((p) => (
                  <Tr key={p.name}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td className="tabular text-right text-ink-muted">
                      {formatQuantity(p.quantity, ctx.number_format)}
                    </Td>
                    <Td className="tabular text-right">
                      {formatMoney(toDecimalString(p.cost), ctx)}
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
