import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { toDecimalString } from "@/domain/money/decimal";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import {
  RANGE_PRESETS,
  loadSalesReport,
  resolveRange,
} from "@/features/reports/queries";
import { formatMoney, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Sales report" };

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  qr: "QR",
  card: "Card",
  wallet: "Wallet",
  credit: "On credit",
  other: "Other",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[13px] text-ink-muted">{label}</p>
        <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function SalesReportPage({
  searchParams,
}: PageProps<"/reports/sales">) {
  const params = await searchParams;
  const preset = typeof params.range === "string" ? params.range : "month";

  const memberships = await listMemberships();
  const business = memberships[0].business;
  const ctx = formatContextOf(business);

  const range = resolveRange(preset, business.timezone);
  const report = await loadSalesReport(range);

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
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            Sales and profit
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {range.label} · {range.from} to {range.to}
          </p>
        </div>

        <nav aria-label="Date range" className="flex flex-wrap gap-1.5 print:hidden">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.value}
              href={`/reports/sales?range=${p.value}`}
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

      {report.saleCount === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={`No sales in this period`}
          description="Pick a wider date range, or record a sale at the counter to see it here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Revenue"
              value={formatMoney(toDecimalString(report.profit.revenue), ctx)}
              hint={`${report.saleCount} ${report.saleCount === 1 ? "sale" : "sales"}`}
            />
            <Stat
              label="Cost of goods"
              value={formatMoney(toDecimalString(report.profit.costOfGoods), ctx)}
              hint="At the cost captured when sold"
            />
            <Stat
              label="Gross profit"
              value={formatMoney(toDecimalString(report.profit.grossProfit), ctx)}
              hint={
                report.profit.margin === null
                  ? undefined
                  : `${report.profit.margin.toFixed(1)}% margin`
              }
            />
            <Stat
              label="Net profit"
              value={formatMoney(toDecimalString(report.net), ctx)}
              hint={`after ${formatMoney(report.expenses, ctx)} expenses`}
            />
          </div>

          <h2 className="mt-10 mb-4 text-base font-semibold text-ink">By product</h2>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Sold</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Profit</Th>
                </tr>
              </thead>
              <tbody>
                {report.byProduct.map((p) => (
                  <Tr key={p.name}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td className="tabular text-right text-ink-muted">
                      {formatQuantity(p.quantity, ctx.number_format)}
                    </Td>
                    <Td className="tabular text-right">{formatMoney(p.revenue, ctx)}</Td>
                    <Td className="tabular text-right">
                      <span className={p.profit < 0 ? "text-critical" : "text-ink"}>
                        {formatMoney(p.profit, ctx)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {report.byMethod.length > 0 ? (
            <>
              <h2 className="mt-10 mb-4 text-base font-semibold text-ink">
                How customers paid
              </h2>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
                {report.byMethod.map((m) => (
                  <li
                    key={m.method}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="text-ink">{METHOD_LABEL[m.method] ?? m.method}</span>
                    <span className="tabular font-medium text-ink">
                      {formatMoney(m.amount, ctx)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
