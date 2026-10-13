/**
 * Money is handled as integer minor units (paisa, cents) so that arithmetic is
 * exact. Never add or multiply currency as a JS float (SPEC §67).
 *
 * Postgres returns numeric as a string precisely to avoid float loss, so the
 * boundary between the database and this module is string-based.
 */

const SCALE = 2;
const FACTOR = 10 ** SCALE;

export type Money = number; // minor units, always an integer

export function fromDecimalString(value: string | number | null | undefined): Money {
  if (value === null || value === undefined || value === "") return 0;

  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Not a decimal number: ${text}`);
  }

  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace("-", "").split(".");

  // Round half-up on the discarded digits rather than truncating.
  const kept = frac.slice(0, SCALE).padEnd(SCALE, "0");
  const next = frac.charCodeAt(SCALE) - 48;
  let minor = Number(whole) * FACTOR + Number(kept);
  if (next >= 5) minor += 1;

  return negative ? -minor : minor;
}

export function toDecimalString(amount: Money): string {
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const whole = Math.floor(abs / FACTOR);
  const frac = String(abs % FACTOR).padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export const add = (a: Money, b: Money): Money => a + b;
export const subtract = (a: Money, b: Money): Money => a - b;
export const sum = (values: Money[]): Money => values.reduce((t, v) => t + v, 0);

/** Multiply money by a plain quantity, rounding half-up to minor units. */
export function multiply(amount: Money, quantity: number): Money {
  const exact = amount * quantity;
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}

/** Percentage of an amount, e.g. a 12.5% discount. */
export function percentOf(amount: Money, percent: number): Money {
  return multiply(amount, percent / 100);
}

/** Round to the nearest whole currency unit; returns the adjustment applied. */
export function roundOff(amount: Money): { rounded: Money; adjustment: Money } {
  const rounded = Math.round(amount / FACTOR) * FACTOR;
  return { rounded, adjustment: rounded - amount };
}
