import assert from "node:assert/strict";
import { test } from "vitest";
import { fromDecimalString, toDecimalString } from "@/domain/money/decimal";
import { baseQuantity, calculateTotals, lineTotal, type CartLine } from "./totals";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  name: "Ball Pen",
  unitId: "u1",
  unitSymbol: "pc",
  conversionToBase: 1,
  quantity: 1,
  unitPrice: fromDecimalString("20"),
  lineDiscount: 0,
  ...over,
});

test("a line is price times quantity less its discount", () => {
  assert.equal(toDecimalString(lineTotal(line({ quantity: 10 }))), "200.00");
  assert.equal(
    toDecimalString(
      lineTotal(
        line({
          quantity: 2,
          unitPrice: fromDecimalString("50"),
          lineDiscount: fromDecimalString("10"),
        }),
      ),
    ),
    "90.00",
  );
});

test("totals add up across lines with a sale discount", () => {
  const t = calculateTotals({
    lines: [
      line({ quantity: 5 }),
      line({
        productId: "p2",
        quantity: 2,
        unitPrice: fromDecimalString("50"),
        lineDiscount: fromDecimalString("10"),
      }),
    ],
    discount: fromDecimalString("40"),
    paid: fromDecimalString("150"),
  });

  assert.equal(toDecimalString(t.subtotal), "190.00");
  assert.equal(toDecimalString(t.total), "150.00");
  assert.equal(toDecimalString(t.due), "0.00");
});

test("an unpaid sale leaves the full amount owing", () => {
  const t = calculateTotals({ lines: [line({ quantity: 3 })] });
  assert.equal(toDecimalString(t.total), "60.00");
  assert.equal(toDecimalString(t.due), "60.00");
});

test("awkward prices stay exact across many lines", () => {
  const t = calculateTotals({
    lines: Array.from({ length: 3 }, (_, i) =>
      line({ productId: `p${i}`, quantity: 1, unitPrice: fromDecimalString("10.10") }),
    ),
  });
  assert.equal(toDecimalString(t.subtotal), "30.30");
});

test("additional charges and round-off apply after the discount", () => {
  const t = calculateTotals({
    lines: [line({ quantity: 1, unitPrice: fromDecimalString("199.60") })],
    additionalCharge: fromDecimalString("10"),
    roundOff: fromDecimalString("0.40"),
  });
  assert.equal(toDecimalString(t.total), "210.00");
});

test("overpayment shows as a negative amount owing", () => {
  const t = calculateTotals({
    lines: [line({ quantity: 1 })],
    paid: fromDecimalString("50"),
  });
  assert.equal(toDecimalString(t.due), "-30.00");
});

test("a box of twelve removes twelve base units", () => {
  assert.equal(baseQuantity(line({ quantity: 2, conversionToBase: 12 })), 24);
});
