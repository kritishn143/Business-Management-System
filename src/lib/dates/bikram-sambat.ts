import { toBik, toBik_euro, toGreg_text } from "bikram-sambat";

/**
 * Bikram Sambat presentation (SPEC §68).
 *
 * The BS month lengths are set by the Nepali calendar authority and follow no
 * formula, so the official table is taken from the `bikram-sambat` package
 * rather than reproduced here — a hand-written table silently produces wrong
 * dates, which is worse than not offering BS at all.
 *
 * Canonical transaction dates remain timestamptz. This converts a calendar
 * date already resolved in the business timezone.
 */

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Asoj",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;

export type BsDate = { year: number; month: number; day: number };

export class BsRangeError extends Error {
  constructor(iso: string) {
    super(`${iso} is outside the supported Bikram Sambat range.`);
    this.name = "BsRangeError";
  }
}

/** `isoDate` must be YYYY-MM-DD, already resolved in the shop's timezone. */
export function toBikramSambat(isoDate: string): BsDate {
  try {
    const d = toBik(isoDate) as BsDate;
    if (!d || !d.year) throw new BsRangeError(isoDate);
    return d;
  } catch (cause) {
    if (cause instanceof BsRangeError) throw cause;
    throw new BsRangeError(isoDate);
  }
}

export function formatBikramSambat(
  isoDate: string,
  style: "short" | "long" = "long",
): string {
  if (style === "short") {
    try {
      return toBik_euro(isoDate) as string;
    } catch {
      throw new BsRangeError(isoDate);
    }
  }

  const bs = toBikramSambat(isoDate);
  return `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year}`;
}

/** BS back to Gregorian, for date inputs that collect a BS date. */
export function fromBikramSambat(bsDate: string): string {
  const [year, month, day] = bsDate.split("-").map(Number);
  if (!year || !month || !day) throw new BsRangeError(bsDate);
  try {
    return toGreg_text(year, month, day) as string;
  } catch {
    throw new BsRangeError(bsDate);
  }
}
