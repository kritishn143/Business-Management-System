import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BsRangeError,
  formatBikramSambat,
  fromBikramSambat,
  toBikramSambat,
} from "./bikram-sambat";

/** New Year falls on 1 Baisakh, which is mid-April in Gregorian terms. */
const NEW_YEARS: [string, string][] = [
  ["2000-04-13", "2057-01-01"],
  ["2017-04-14", "2074-01-01"],
  ["2021-04-14", "2078-01-01"],
  ["2023-04-14", "2080-01-01"],
  ["2024-04-13", "2081-01-01"],
];

test("converts known Nepali New Year dates", () => {
  for (const [ad, bs] of NEW_YEARS) {
    assert.equal(formatBikramSambat(ad, "short"), bs, `for ${ad}`);
  }
});

test("converts a mid-year date", () => {
  const d = toBikramSambat("2026-09-27");
  assert.deepEqual(d, { year: 2083, month: 6, day: 11 });
  assert.equal(formatBikramSambat("2026-09-27"), "11 Asoj 2083");
});

test("round-trips back to Gregorian", () => {
  for (const [ad, bs] of NEW_YEARS) {
    assert.equal(fromBikramSambat(bs), ad);
  }
});

test("a new year rolls over rather than repeating a month", () => {
  const before = toBikramSambat("2023-04-13");
  const after = toBikramSambat("2023-04-14");
  assert.equal(before.month, 12);
  assert.equal(after.month, 1);
  assert.equal(after.year, before.year + 1);
});

test("every day of a year maps to a distinct BS date", () => {
  const seen = new Set<string>();
  const start = Date.UTC(2023, 3, 14);
  for (let i = 0; i < 365; i += 1) {
    const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const bs = formatBikramSambat(iso, "short");
    assert.ok(!seen.has(bs), `duplicate BS date ${bs} at ${iso}`);
    seen.add(bs);
  }
  assert.equal(seen.size, 365);
});

test("refuses an out-of-range date rather than returning a wrong one", () => {
  assert.throws(() => toBikramSambat("1800-01-01"), BsRangeError);
});
