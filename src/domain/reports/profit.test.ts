import assert from "node:assert/strict";
import { test } from "vitest";
import { fromDecimalString, toDecimalString } from "@/domain/money/decimal";
import { grossProfit, netProfit } from "./profit";

test("gross profit is revenue less the cost captured at sale time", () => {
  const p = grossProfit([
    { quantity: 10, lineTotal: "600.00", costPrice: "26.25" },
    { quantity: 5, lineTotal: "300.00", costPrice: "26.25" },
  ]);

  assert.equal(toDecimalString(p.revenue), "900.00");
  assert.equal(toDecimalString(p.costOfGoods), "393.75"); // 15 x 26.25
  assert.equal(toDecimalString(p.grossProfit), "506.25");
});

test("margin is a percentage of revenue", () => {
  const p = grossProfit([{ quantity: 1, lineTotal: "100.00", costPrice: "60.00" }]);
  assert.equal(p.margin, 40);
});

test("a giveaway has no margin rather than dividing by zero", () => {
  const p = grossProfit([{ quantity: 1, lineTotal: "0", costPrice: "0" }]);
  assert.equal(p.margin, null);
});

test("selling below cost reports a loss, not zero", () => {
  const p = grossProfit([{ quantity: 2, lineTotal: "50.00", costPrice: "40.00" }]);
  assert.equal(toDecimalString(p.grossProfit), "-30.00");
});

test("no sales means no revenue and no profit", () => {
  const p = grossProfit([]);
  assert.equal(toDecimalString(p.revenue), "0.00");
  assert.equal(toDecimalString(p.grossProfit), "0.00");
  assert.equal(p.margin, null);
});

test("net profit subtracts expenses and adds other income", () => {
  const n = netProfit({
    gross: fromDecimalString("506.25"),
    expenses: fromDecimalString("200.00"),
    otherIncome: fromDecimalString("50.00"),
  });
  assert.equal(toDecimalString(n), "356.25");
});

test("fractional costs stay exact across many lines", () => {
  const p = grossProfit(
    Array.from({ length: 3 }, () => ({
      quantity: 1,
      lineTotal: "10.10",
      costPrice: "3.37",
    })),
  );
  assert.equal(toDecimalString(p.revenue), "30.30");
  assert.equal(toDecimalString(p.costOfGoods), "10.11");
  assert.equal(toDecimalString(p.grossProfit), "20.19");
});
