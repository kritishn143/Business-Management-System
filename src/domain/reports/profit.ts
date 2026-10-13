import { fromDecimalString, subtract, sum, type Money } from "@/domain/money/decimal";

export type SaleLineForProfit = {
  quantity: number;
  /** What the customer paid for this line, after its own discount. */
  lineTotal: string | number;
  /** Cost captured at the time of sale, per unit. */
  costPrice: string | number;
};

export type ProfitSummary = {
  revenue: Money;
  costOfGoods: Money;
  grossProfit: Money;
  margin: number | null;
};

/**
 * Gross profit = net sales − cost of goods sold, where COGS uses the cost
 * captured on each line when it was sold. Never the current purchase price —
 * that would make historical profit drift every time a cost changes (SPEC §20).
 */
export function grossProfit(lines: SaleLineForProfit[]): ProfitSummary {
  const revenue = sum(lines.map((l) => fromDecimalString(l.lineTotal)));

  const costOfGoods = sum(
    lines.map((l) => {
      const unitCost = fromDecimalString(l.costPrice);
      const exact = unitCost * l.quantity;
      return exact < 0 ? -Math.round(-exact) : Math.round(exact);
    }),
  );

  const profit = subtract(revenue, costOfGoods);

  return {
    revenue,
    costOfGoods,
    grossProfit: profit,
    margin: revenue === 0 ? null : (profit / revenue) * 100,
  };
}

/** Net profit also takes operating costs and non-sale income into account. */
export function netProfit({
  gross,
  expenses,
  otherIncome,
}: {
  gross: Money;
  expenses: Money;
  otherIncome: Money;
}): Money {
  return gross - expenses + otherIncome;
}
