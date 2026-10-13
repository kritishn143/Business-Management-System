import assert from "node:assert/strict";
import { test } from "vitest";
import { formatMoney, formatQuantity } from "./index";

const npr = {
  currency_code: "NPR",
  currency_position: "before" as const,
  number_format: "en-IN",
  timezone: "Asia/Kathmandu",
  date_format: "dd MMM yyyy",
};

test("formats money with two decimals and a symbol", () => {
  assert.equal(formatMoney("1234.5", npr), "Rs 1,234.50");
  assert.equal(formatMoney(0, npr), "Rs 0.00");
});

test("puts the minus sign outside the currency symbol", () => {
  assert.equal(formatMoney("-250", npr), "-Rs 250.00");
});

test("honours currency position", () => {
  assert.equal(
    formatMoney("99", { ...npr, currency_position: "after" }),
    "99.00 Rs",
  );
});

test("falls back to zero rather than rendering NaN", () => {
  assert.equal(formatMoney(null, npr), "Rs 0.00");
  assert.equal(formatMoney("not a number", npr), "Rs 0.00");
});

test("quantities drop trailing zeros", () => {
  assert.equal(formatQuantity("140.0000"), "140");
  assert.equal(formatQuantity("2.5"), "2.5");
});

import { formatDate, formatDateTime, formatPlainDate } from "./index";

const bs = { ...npr, date_system: "BS" as const };

test("renders Bikram Sambat when the shop uses it", () => {
  assert.equal(formatDate("2026-09-27T06:00:00Z", bs), "11 Asoj 2083");
  assert.equal(formatPlainDate("2026-09-27", bs), "11 Asoj 2083");
});

test("renders Gregorian when the shop uses AD", () => {
  const ad = { ...npr, date_system: "AD" as const };
  assert.match(formatDate("2026-09-27T06:00:00Z", ad), /2026/);
});

test("dates an evening sale by the shop's own day, not UTC", () => {
  // 18:30 UTC is 00:15 the next day in Kathmandu (UTC+5:45).
  assert.equal(formatDate("2026-09-26T18:30:00Z", bs), "11 Asoj 2083");
});

test("falls back to Gregorian rather than failing outside the BS table", () => {
  assert.match(formatDate("1800-01-01T00:00:00Z", bs), /1800|1799/);
});

test("keeps the time alongside a BS date", () => {
  assert.match(formatDateTime("2026-09-27T06:00:00Z", bs), /^11 Asoj 2083, /);
});
