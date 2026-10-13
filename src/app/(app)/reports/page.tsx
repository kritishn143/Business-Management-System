import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, HandCoins, ShoppingCart, TrendingUp, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  {
    href: "/reports/sales",
    title: "Sales and profit",
    description:
      "Revenue, cost of goods and profit over a period, broken down by product and payment method.",
    icon: TrendingUp,
    ready: true,
  },
  {
    href: "/reports/inventory",
    title: "Stock valuation",
    description: "What you hold, what it cost, and what is running out.",
    icon: Boxes,
    ready: true,
  },
  {
    href: "/reports/purchases",
    title: "Purchases",
    description: "What you bought over a period, from which suppliers, and what is still owed.",
    icon: ShoppingCart,
    ready: true,
  },
  {
    href: "/reports/receivables",
    title: "Receivables",
    description: "Who owes you, aged from the day each amount fell due.",
    icon: Users,
    ready: true,
  },
  {
    href: "/reports/payables",
    title: "Payables",
    description: "Whom you owe, aged the same way, so nothing is missed.",
    icon: HandCoins,
    ready: true,
  },
  {
    href: "/reports/cash-flow",
    title: "Cash flow",
    description: "Where money came from and where it went over a period.",
    icon: Wallet,
    ready: true,
  },
] as const;

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reports"
        description="The numbers behind the day. Every figure traces back to a transaction."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map(({ href, title, description, icon: Icon, ready }) => {
          const body = (
            <CardContent className="pt-6">
              <span className="flex size-9 items-center justify-center rounded-lg bg-surface-sunken">
                <Icon className="size-4 text-ink-subtle" />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold text-ink">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
              {!ready ? (
                <p className="mt-3 text-xs text-ink-subtle">Not built yet</p>
              ) : null}
            </CardContent>
          );

          return ready ? (
            <Card key={href} className="transition-colors hover:border-line-strong">
              <Link href={href} className="block">
                {body}
              </Link>
            </Card>
          ) : (
            <Card key={href} className="opacity-60">
              {body}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
