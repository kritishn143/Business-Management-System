import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, PackageX, Plus, Store } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { loadOverview, type AttentionItem } from "@/features/dashboard/queries";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <CardContent className="pt-6">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </CardContent>
  );

  return href ? (
    <Card className="transition-colors hover:border-line-strong">
      <Link href={href} className="block">
        {body}
      </Link>
    </Card>
  ) : (
    <Card>{body}</Card>
  );
}

function AttentionList({
  title,
  icon: Icon,
  tone,
  items,
  numberFormat,
}: {
  title: string;
  icon: typeof AlertTriangle;
  tone: "caution" | "critical";
  items: AttentionItem[];
  numberFormat: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon
          className={tone === "critical" ? "size-4 text-critical" : "size-4 text-caution"}
        />
        {title}
      </h3>
      <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
        {items.map((i) => (
          <li key={i.id}>
            <Link
              href={`/inventory/products/${i.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-surface-sunken"
            >
              <span className="min-w-0 truncate text-ink">{i.name}</span>
              <span className="tabular shrink-0 text-ink-muted">
                {formatQuantity(i.quantity, numberFormat)} {i.unit}
                {i.minimum > 0 ? (
                  <span className="text-ink-subtle">
                    {" "}
                    / {formatQuantity(i.minimum, numberFormat)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MOVEMENT_LABEL: Record<string, string> = {
  opening: "Opening stock",
  purchase: "Purchase",
  sale: "Sale",
  sale_return: "Customer return",
  purchase_return: "Returned to supplier",
  adjustment: "Adjustment",
  damage: "Damaged",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
};

async function Overview() {
  const [overview, memberships] = await Promise.all([loadOverview(), listMemberships()]);

  const ctx = formatContextOf(memberships[0].business);

  if (overview.productCount === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Your shop is set up — now add what you sell"
        description="Add your products and their opening stock. Stock value, low-stock warnings and recent activity will appear here."
        action={
          <Button asChild>
            <Link href="/inventory/products/new">
              <Plus />
              Add your first product
            </Link>
          </Button>
        }
      />
    );
  }

  const needsAttention = overview.lowStock.length + overview.outOfStock.length;

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Stock value"
          value={formatMoney(overview.stockValue, ctx)}
          hint="At weighted-average cost"
          href="/inventory"
        />
        <Metric
          label="Products"
          value={String(overview.productCount)}
          hint={`${overview.trackedCount} tracked for stock`}
          href="/inventory"
        />
        <Metric
          label="Needs attention"
          value={String(needsAttention)}
          hint={needsAttention === 0 ? "Nothing running low" : "Low or out of stock"}
        />
      </div>

      {needsAttention > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AttentionList
            title="Out of stock"
            icon={PackageX}
            tone="critical"
            items={overview.outOfStock}
            numberFormat={ctx.number_format}
          />
          <AttentionList
            title="Running low"
            icon={AlertTriangle}
            tone="caution"
            items={overview.lowStock}
            numberFormat={ctx.number_format}
          />
        </div>
      ) : null}

      {overview.recentMovements.length > 0 ? (
        <div>
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Recent stock activity</h3>
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface-raised">
            {overview.recentMovements.map((m) => {
              const qty = Number(m.quantity);
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">{m.product_name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-ink-muted">
                      {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                    </span>
                    <span
                      className={
                        qty > 0 ? "tabular text-positive" : "tabular text-critical"
                      }
                    >
                      {qty > 0 ? "+" : "−"}
                      {formatQuantity(Math.abs(qty), ctx.number_format)}
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {formatDateTime(m.created_at, ctx)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={firstName ? `${greeting(new Date().getHours())}, ${firstName}` : "Overview"}
        description="Your shop at a glance."
        actions={
          <Button asChild variant="secondary">
            <Link href="/inventory/products/new">
              <Plus />
              Add product
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </div>
  );
}
