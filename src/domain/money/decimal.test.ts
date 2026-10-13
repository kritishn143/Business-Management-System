import assert from "node:assert/strict";
import { test } from "vitest";
import {
  fromDecimalString,
  toDecimalString,
  multiply,
  percentOf,
  roundOff,
  sum,
} from "./decimal";

test("parses and re-renders decimals without float drift", () => {
  assert.equal(toDecimalString(fromDecimalString("10.10")), "10.10");
  assert.equal(toDecimalString(fromDecimalString("0.07")), "0.07");
  assert.equal(toDecimalString(fromDecimalString("1234567.89")), "1234567.89");
  assert.equal(toDecimalString(fromDecimalString("-45.05")), "-45.05");
  assert.equal(toDecimalString(fromDecimalString("12")), "12.00");
});

test("the classic float failure does not occur", () => {
  // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic.
  const total = sum([fromDecimalString("0.1"), fromDecimalString("0.2")]);
  assert.equal(toDecimalString(total), "0.30");
});

test("Rs 10.10 never becomes 10.099999", () => {
  const ten = fromDecimalString("10.10");
  assert.equal(toDecimalString(sum(Array(3).fill(ten))), "30.30");
});

test("rounds half-up on extra precision", () => {
  assert.equal(toDecimalString(fromDecimalString("1.005")), "1.01");
  assert.equal(toDecimalString(fromDecimalString("1.004")), "1.00");
  assert.equal(toDecimalString(fromDecimalString("-1.005")), "-1.01");
});

test("multiplies by quantity exactly", () => {
  assert.equal(toDecimalString(multiply(fromDecimalString("19.99"), 3)), "59.97");
  assert.equal(toDecimalString(multiply(fromDecimalString("0.10"), 7)), "0.70");
});

test("computes percentages", () => {
  assert.equal(toDecimalString(percentOf(fromDecimalString("250.00"), 12.5)), "31.25");
  assert.equal(toDecimalString(percentOf(fromDecimalString("99.99"), 10)), "10.00");
});

test("rounds off to whole units and reports the adjustment", () => {
  const { rounded, adjustment } = roundOff(fromDecimalString("199.60"));
  assert.equal(toDecimalString(rounded), "200.00");
  assert.equal(toDecimalString(adjustment), "0.40");
});

test("rejects values that are not decimals", () => {
  assert.throws(() => fromDecimalString("12,50"));
  assert.throws(() => fromDecimalString("abc"));
});
