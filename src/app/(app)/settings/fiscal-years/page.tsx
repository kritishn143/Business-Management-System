import type { Metadata } from "next";
import Link from "next/link";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { listFiscalYears } from "@/features/fiscal/queries";
import { FiscalYearList } from "@/features/fiscal/year-list";
import { SettingsSection } from "@/features/settings/section";
import { localCalendarDate } from "@/lib/format";
import { MONTHS } from "@/features/settings/schemas";

export const metadata: Metadata = { title: "Financial years" };

export default async function FiscalYearsPage() {
  const { business, role } = await loadActiveBusiness();
  const ctx = formatContextOf(business);

  // "Has this year ended?" is answered in the shop's timezone, not the server's.
  const today = localCalendarDate(new Date().toISOString(), business.timezone);
  const years = await listFiscalYears(today);

  const canClose = role === "owner" || role === "accountant";
  const canReopen = role === "owner";

  return (
    <SettingsSection
      title="Financial years"
      description="Closing a year records where the shop stood and locks that period against accidental edits."
      readOnlyNote={
        canClose || canReopen
          ? undefined
          : "Only an owner or accountant can close a financial year. You can look, though."
      }
    >
      <div className="mb-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-medium text-ink">Your year runs from</h2>
        <p className="mt-1 text-[15px] text-ink">
          {MONTHS[business.fiscal_year_start_month - 1]}{" "}
          {business.fiscal_year_start_day}
        </p>
        <p className="mt-2 text-[13px] text-ink-muted">
          Change this under{" "}
          <Link href="/settings/localization" className="text-accent hover:underline">
            currency and dates
          </Link>
          . It decides which year a transaction falls into.
        </p>
      </div>

      <FiscalYearList
        years={years}
        ctx={ctx}
        today={today}
        canClose={canClose}
        canReopen={canReopen}
      />

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-medium text-ink">What closing does</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] text-ink-muted">
          <li>Keeps every transaction exactly as it is — nothing is deleted or moved.</li>
          <li>
            Records the closing position: what each customer and supplier owed, what
            stock was on hand and what it cost, and what each account held.
          </li>
          <li>
            Refuses new or edited transactions dated inside the closed period, so last
            year&rsquo;s books cannot drift.
          </li>
          <li>Opens the year that follows, so the shop keeps trading.</li>
          <li>
            Adds no ledger entries of its own. The party and stock ledgers run
            continuously, so posting carried-forward balances on top would count
            every one of them twice.
          </li>
        </ul>
      </div>
    </SettingsSection>
  );
}
