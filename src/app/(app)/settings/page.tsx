import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  CalendarClock,
  ChevronRight,
  FileText,
  Globe,
  Database,
  History,
  Lock,
  Store,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { loadSettings } from "@/features/settings/queries";
import { formatMoney } from "@/lib/format";
import { formatContextOf } from "@/features/businesses/format-context";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/business",
    icon: Store,
    title: "Business details",
    description: "Name, contact details and registration number.",
  },
  {
    href: "/settings/localization",
    icon: Globe,
    title: "Currency and dates",
    description: "Currency, number grouping, time zone, calendar and fiscal year.",
  },
  {
    href: "/settings/users",
    icon: Users,
    title: "People",
    description: "Who has access to this shop, and what they may do.",
  },
  {
    href: "/settings/activity",
    icon: History,
    title: "Activity",
    description: "Every change to money, stock and access, and who made it.",
  },
  {
    href: "/settings/invoices",
    icon: FileText,
    title: "Invoices",
    description: "Logo, heading, terms, payment details and the paper you print on.",
  },
  {
    href: "/settings/fiscal-years",
    icon: CalendarClock,
    title: "Financial years",
    description: "Close a year to lock its books and record where the shop stood.",
  },
  {
    href: "/settings/data",
    icon: Database,
    title: "Your data",
    description: "Download your products, contacts and transactions as CSV.",
  },
] as const;

const LATER = [
  { icon: Boxes, title: "Inventory and sales", description: "Defaults for stock, pricing and the counter." },
  { icon: Lock, title: "Security", description: "Sessions and sign-in." },
  { icon: Upload, title: "Importing", description: "Bring products and contacts in from a spreadsheet." },
] as const;

export default async function SettingsPage() {
  const { business, role } = await loadSettings();
  const ctx = formatContextOf(business);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="How this shop works. Changes apply everywhere at once."
      />

      {/* What the settings below currently add up to, so the page has an answer
          before you open anything. */}
      <div className="mb-8 rounded-xl border border-line bg-surface-raised p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-ink">
              {business.name}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {business.phone ?? "No phone yet"} · {business.email ?? "No email yet"}
            </p>
          </div>
          <Badge tone={role === "owner" ? "positive" : "neutral"}>
            You are {role === "owner" ? "the owner" : `a ${role.replace("_", " ")}`}
          </Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-subtle">Money</dt>
            <dd className="tabular mt-1 text-sm text-ink">{formatMoney(1234.5, ctx)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-subtle">Calendar</dt>
            <dd className="mt-1 text-sm text-ink">
              {business.date_system === "BS" ? "Bikram Sambat" : "Gregorian"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-subtle">Time zone</dt>
            <dd className="mt-1 text-sm text-ink">{business.timezone}</dd>
          </div>
        </dl>
      </div>

      <ul className="space-y-3">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-4 rounded-xl border border-line bg-surface-raised p-5 transition-colors hover:border-line-strong"
            >
              <Icon className="size-5 shrink-0 text-ink-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-ink">{title}</h3>
                <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-10 text-sm font-medium text-ink-muted">Still to come</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {LATER.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-xl border border-dashed border-line p-4"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            <div>
              <h3 className="text-[13px] font-medium text-ink-muted">{title}</h3>
              <p className="mt-0.5 text-[13px] text-ink-subtle">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
