import { fromDecimalString, type Money } from "@/domain/money/decimal";

export type AgeingEntry = {
  /** Calendar date the entry was raised, as YYYY-MM-DD. */
  date: string;
  debit: string | number;
  credit: string | number;
};

export const AGEING_BUCKETS = [
  { key: "current", label: "Not yet 30 days", upTo: 30 },
  { key: "d30", label: "30 to 60 days", upTo: 60 },
  { key: "d60", label: "60 to 90 days", upTo: 90 },
  { key: "d90", label: "Over 90 days", upTo: Infinity },
] as const;

export type AgeingBucketKey = (typeof AGEING_BUCKETS)[number]["key"];

export type Ageing = {
  /** What is still owed. Negative means they are in credit with us. */
  balance: Money;
  /** Open debits split by how long they have been outstanding. */
  buckets: Record<AgeingBucketKey, Money>;
  /** Money received that no longer matches any debit — an advance. */
  unapplied: Money;
  /** Age in days of the oldest still-open debit, or null if nothing is open. */
  oldestDays: number | null;
};

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function bucketFor(days: number): AgeingBucketKey {
  for (const bucket of AGEING_BUCKETS) {
    if (days < bucket.upTo) return bucket.key;
  }
  return "d90";
}

/**
 * Ages what a party owes.
 *
 * Payments in this system are recorded against the party, not against a
 * particular invoice (SPEC §34), so there is nothing to read an allocation
 * from. We apply each credit to the oldest open debit first — the convention a
 * shopkeeper would use by hand — and age whatever debits remain.
 *
 * `asOf` and every entry date are plain calendar dates already resolved in the
 * shop's timezone, so this function never touches a clock.
 */
export function ageBalance({
  entries,
  openingBalance = 0,
  openingDate,
  asOf,
}: {
  entries: AgeingEntry[];
  /** Balance carried in before the ledger starts, e.g. from a migration. */
  openingBalance?: string | number;
  /** Date to age the opening balance from. Defaults to the earliest entry. */
  openingDate?: string;
  asOf: string;
}): Ageing {
  const opening = fromDecimalString(openingBalance);

  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Open debits, oldest first, so credits can be applied against them in turn.
  const open: { date: string; amount: Money }[] = [];
  let credit = 0;

  const seedDate = openingDate ?? ordered[0]?.date ?? asOf;
  if (opening > 0) open.push({ date: seedDate, amount: opening });
  if (opening < 0) credit = -opening;

  for (const entry of ordered) {
    const debit = fromDecimalString(entry.debit);
    if (debit > 0) open.push({ date: entry.date, amount: debit });
    credit += fromDecimalString(entry.credit);
  }

  // Oldest first. A credit that outlives every debit stays unapplied.
  while (credit > 0 && open.length > 0) {
    const oldest = open[0];
    if (oldest.amount > credit) {
      oldest.amount -= credit;
      credit = 0;
    } else {
      credit -= oldest.amount;
      open.shift();
    }
  }

  const buckets: Record<AgeingBucketKey, Money> = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
  };

  let oldestDays: number | null = null;

  for (const debit of open) {
    const days = daysBetween(debit.date, asOf);
    buckets[bucketFor(days)] += debit.amount;
    if (oldestDays === null || days > oldestDays) oldestDays = days;
  }

  const outstanding = open.reduce((total, d) => total + d.amount, 0);

  return {
    balance: outstanding - credit,
    buckets,
    unapplied: credit,
    oldestDays,
  };
}
