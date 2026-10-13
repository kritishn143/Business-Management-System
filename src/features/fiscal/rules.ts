/**
 * The rules that decide what the financial-years screen offers. Pure, and
 * mirrored by the database, which enforces the same things for real (SPEC §25).
 */

export type YearShape = {
  id: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "closed";
};

/** Whether a year has finished, as at a date in the shop's own timezone. */
export function hasEnded(year: Pick<YearShape, "endsOn">, today: string): boolean {
  return year.endsOn < today;
}

/** Whether today falls inside the year. */
export function isCurrent(
  year: Pick<YearShape, "startsOn" | "endsOn">,
  today: string,
): boolean {
  return year.startsOn <= today && today <= year.endsOn;
}

/**
 * The only year that may be closed: the earliest finished one still open. A
 * later year's opening position comes from the one before it, so closing out of
 * order would make it a guess.
 */
export function closableYear<T extends YearShape>(
  years: T[],
  today: string,
): T | null {
  const candidates = years
    .filter((y) => y.status === "open" && hasEnded(y, today))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  return candidates[0] ?? null;
}

/**
 * Whether reopening this year is coherent: a later year that is already closed
 * took its opening position from this one, so that one must be reopened first.
 */
export function canReopen<T extends YearShape>(year: T, years: T[]): boolean {
  if (year.status !== "closed") return false;
  return !years.some((y) => y.status === "closed" && y.startsOn > year.startsOn);
}
