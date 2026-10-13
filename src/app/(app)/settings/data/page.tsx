import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPORTS } from "@/features/data/exports";
import { SettingsSection } from "@/features/settings/section";

export const metadata: Metadata = { title: "Your data" };

export default function DataSettingsPage() {
  return (
    <SettingsSection
      title="Your data"
      description="Your records are yours. Take a copy whenever you like."
    >
      <ul className="overflow-hidden rounded-xl border border-line bg-surface-raised">
        {Object.entries(EXPORTS).map(([key, { label, description }]) => (
          <li key={key} className="border-b border-line last:border-0">
            {/* A plain link, so the browser downloads it like any other file. */}
            <a
              href={`/api/export/${key}`}
              download
              className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-sunken"
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium text-ink">{label}</h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>
              </div>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-subtle group-hover:text-accent">
                <Download className="size-4" aria-hidden />
                CSV
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-medium text-ink">About these files</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] text-ink-muted">
          <li>
            Plain CSV, readable by Excel, Numbers, Google Sheets and anything else
            that opens a spreadsheet.
          </li>
          <li>
            Amounts are written as plain numbers without a currency symbol, so they
            stay numbers when a spreadsheet opens them.
          </li>
          <li>
            A download contains only this shop&rsquo;s records, and only what your
            role is allowed to read.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-medium text-ink">Bringing data in</h2>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Products, customers and suppliers can be imported from a CSV, with a
          preview of exactly what will be created before anything is saved.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/inventory/products/import">Products</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/customers/import">Customers</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/suppliers/import">Suppliers</Link>
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
