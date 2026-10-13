import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { toDecimalString } from "@/domain/money/decimal";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { loadCashFlowReport, type CashFlowLine } from "@/features/reports/cash-flow";
import { RANGE_PRESETS, resolveRange } from "@/features/reports/queries";
import { formatMoney } from "@/lib/format";
import type { FormatContext } from "@/lib/format";

export const metadata: Metadata = { title: "Cash flow" };

function Lines({
  title,
  lines,
  total,
  ctx,
  tone,
}: {
  title: string;
  lines: CashFlowLine[];
  total: number;
  ctx: FormatContext;
  tone: "positive" | "critical";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <span
          className={
            "tabular text-lg font-semibold " +
            (tone === "positive" ? "text-positive" : "text-critical")
          }
        >
          {formatMoney(toDecimalString(total), ctx)}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-subtle">Nothing in this period.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li
              key={line.label}
              className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0"
            >
              <span className="text-ink-muted">{line.label}</span>
              <span className="tabular text-ink">
                {formatMoney(toDecimalString(line.amount), ctx)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function CashFlowReportPage({
  searchParams,
}: PageProps<"/reports/cash-flow">) {
  const params = await searchParams;
  const preset = typeof params.range === "string" ? params.range : "month";

  const { business } = await loadActiveBusiness();
  const ctx = formatContextOf(business);
  const range = resolveRange(preset, business.timezone);
  const report = await loadCashFlowReport(range);

  const nothing = report.totalIn === 0 && report.totalOut === 0;

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
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">Cash flow</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {range.label} · {range.from} to {range.to}
          </p>
        </div>

        <nav aria-label="Date range" className="flex flex-wrap gap-1.5 print:hidden">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.value}
              href={`/reports/cash-flow?range=${p.value}`}
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

      {nothing ? (
        <EmptyState
          icon={Wallet}
          title="No money moved in this period"
          description="Pick a wider date range, or record a sale, payment or expense to see it here."
        />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <p className="text-[13px] text-ink-muted">Net movement</p>
              <p
                className={
                  "tabular mt-1.5 text-3xl font-semibold tracking-tight " +
                  (report.net < 0 ? "text-critical" : "text-ink")
                }
              >
                {formatMoney(toDecimalString(report.net), ctx)}
              </p>
              <p className="mt-1 text-[13px] text-ink-subtle">
                {formatMoney(toDecimalString(report.totalIn), ctx)} in,{" "}
                {formatMoney(toDecimalString(report.totalOut), ctx)} out
              </p>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Lines
              title="Money in"
              lines={report.moneyIn}
              total={report.totalIn}
              ctx={ctx}
              tone="positive"
            />
            <Lines
              title="Money out"
              lines={report.moneyOut}
              total={report.totalOut}
              ctx={ctx}
              tone="critical"
            />
          </div>

          {report.byMethod.length > 0 ? (
            <>
              <h2 className="mt-10 mb-4 text-base font-semibold text-ink">
                How customers paid at the counter
              </h2>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
                {report.byMethod.map((m) => (
                  <li
                    key={m.label}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="text-ink">{m.label}</span>
                    <span className="tabular font-medium text-ink">
                      {formatMoney(toDecimalString(m.amount), ctx)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="mt-6 text-[13px] text-ink-subtle">
            A credit sale is counted when the customer actually pays, not when the
            goods leave, so nothing is counted twice.
          </p>
        </>
      )}
    </div>
  );
}
