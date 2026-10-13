import {
  add,
  fromDecimalString,
  multiply,
  subtract,
  sum,
  toDecimalString,
  type Money,
} from "@/domain/money/decimal";

export type CartLine = {
  productId: string;
  name: string;
  unitId: string;
  unitSymbol: string;
  /** How many base units one of this line's unit represents. */
  conversionToBase: number;
  quantity: number;
  unitPrice: Money;
  lineDiscount: Money;
};

export type SaleTotals = {
  subtotal: Money;
  discount: Money;
  additionalCharge: Money;
  roundOff: Money;
  total: Money;
  paid: Money;
  due: Money;
};

/**
 * The single definition of what a sale costs (SPEC §46). The POS, the invoice
 * and the server all derive from this shape, so they cannot disagree.
 */
export function lineTotal(line: CartLine): Money {
  return subtract(multiply(line.unitPrice, line.quantity), line.lineDiscount);
}

export function calculateTotals({
  lines,
  discount = 0,
  additionalCharge = 0,
  roundOff = 0,
  paid = 0,
}: {
  lines: CartLine[];
  discount?: Money;
  additionalCharge?: Money;
  roundOff?: Money;
  paid?: Money;
}): SaleTotals {
  const subtotal = sum(lines.map(lineTotal));
  const total = add(subtract(subtotal, discount), add(additionalCharge, roundOff));

  return {
    subtotal,
    discount,
    additionalCharge,
    roundOff,
    total,
    paid,
    due: subtract(total, paid),
  };
}

/** Base-unit quantity this line will remove from stock. */
export function baseQuantity(line: CartLine): number {
  return line.quantity * line.conversionToBase;
}

export { fromDecimalString, toDecimalString };
