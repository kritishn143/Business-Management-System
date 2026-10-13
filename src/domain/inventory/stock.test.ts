import assert from "node:assert/strict";
import { test } from "vitest";
import { toDecimalString } from "@/domain/money/decimal";
import {
  fromBaseQuantity,
  stockStatus,
  stockValue,
  toBaseQuantity,
  unitMargin,
} from "./stock";

test("classifies stock levels", () => {
  assert.equal(stockStatus(0, 10), "out_of_stock");
  assert.equal(stockStatus(-3, 10), "out_of_stock");
  assert.equal(stockStatus(10, 10), "low_stock");
  assert.equal(stockStatus(9, 10), "low_stock");
  assert.equal(stockStatus(11, 10), "in_stock");
});

test("no minimum means never low, only out", () => {
  assert.equal(stockStatus(1, 0), "in_stock");
  assert.equal(stockStatus(0, 0), "out_of_stock");
});

test("values stock at weighted-average cost", () => {
  assert.equal(toDecimalString(stockValue(140, "15.00")), "2100.00");
  assert.equal(toDecimalString(stockValue(3, "19.99")), "59.97");
});

test("converts packaging units to the base unit", () => {
  assert.equal(toBaseQuantity(10, 12), 120); // 10 boxes of 12
  assert.equal(fromBaseQuantity(120, 12), 10);
  assert.throws(() => toBaseQuantity(1, 0));
  assert.throws(() => toBaseQuantity(1, -2));
});

test("computes unit margin", () => {
  const m = unitMargin("25.00", "15.00");
  assert.equal(toDecimalString(m.amount), "10.00");
  assert.equal(m.percent, 40);
});

test("a free item has no margin percentage rather than dividing by zero", () => {
  assert.equal(unitMargin("0", "0").percent, null);
});
