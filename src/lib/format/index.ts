import { BsRangeError, formatBikramSambat } from "@/lib/dates/bikram-sambat";
import type { Business } from "@/types/database";

export type FormatContext = Pick<
  Business,
  | "currency_code"
  | "currency_position"
  | "number_format"
  | "timezone"
  | "date_format"
> &
  Partial<Pick<Business, "date_system">>;

/**
 * Presentation only. Never use the output of these for arithmetic — the
 * domain layer owns calculation (SPEC §46, §67).
 */
export function formatMoney(
  value: string | number | null | undefined,
  ctx: FormatContext,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const amount = Number.isFinite(n) ? n : 0;

  const digits = new Intl.NumberFormat(ctx.number_format, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  const symbol = currencySymbol(ctx.currency_code);
  const body =
    ctx.currency_position === "after" ? `${digits} ${symbol}` : `${symbol} ${digits}`;

  return amount < 0 ? `-${body}` : body;
}

export function currencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    NPR: "Rs",
    INR: "₹",
    USD: "$",
    GBP: "£",
    EUR: "€",
  };
  return symbols[code] ?? code;
}

/** Quantities are not money: show only the precision that is meaningful. */
export function formatQuantity(
  value: string | number | null | undefined,
  locale = "en-IN",
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const amount = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * The calendar date this instant falls on *in the shop's timezone*. A sale at
 * 23:40 in Kathmandu must not be dated to the previous day because the server
 * is in UTC (SPEC §68).
 */
export function localCalendarDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string, ctx: FormatContext): string {
  if (ctx.date_system === "BS") {
    try {
      return formatBikramSambat(localCalendarDate(iso, ctx.timezone));
    } catch (error) {
      // Outside the conversion table: show the Gregorian date rather than an
      // error, and note why.
      if (!(error instanceof BsRangeError)) throw error;
    }
  }

  return new Intl.DateTimeFormat(ctx.number_format, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: ctx.timezone,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, ctx: FormatContext): string {
  const time = new Intl.DateTimeFormat(ctx.number_format, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ctx.timezone,
  }).format(new Date(iso));

  if (ctx.date_system === "BS") {
    try {
      return `${formatBikramSambat(localCalendarDate(iso, ctx.timezone))}, ${time}`;
    } catch (error) {
      if (!(error instanceof BsRangeError)) throw error;
    }
  }

  return new Intl.DateTimeFormat(ctx.number_format, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ctx.timezone,
  }).format(new Date(iso));
}

/** A plain YYYY-MM-DD from the database, rendered in the shop's calendar. */
export function formatPlainDate(isoDate: string, ctx: FormatContext): string {
  if (ctx.date_system === "BS") {
    try {
      return formatBikramSambat(isoDate);
    } catch (error) {
      if (!(error instanceof BsRangeError)) throw error;
    }
  }
  return isoDate;
}
