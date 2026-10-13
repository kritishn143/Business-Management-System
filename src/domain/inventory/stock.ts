import { fromDecimalString, multiply, toDecimalString, type Money } from "@/domain/money/decimal";

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";

/**
 * One place decides what "low stock" means, so the badge, the dashboard
 * attention list and the reorder report can never disagree (SPEC §46).
 */
export function stockStatus(
  quantity: number,
  minimumStock: number,
): StockStatus {
  if (quantity <= 0) return "out_of_stock";
  if (minimumStock > 0 && quantity <= minimumStock) return "low_stock";
  return "in_stock";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  out_of_stock: "Out of stock",
  low_stock: "Low stock",
  in_stock: "In stock",
};

/** Value of a holding at its weighted-average cost. */
export function stockValue(quantity: number, averageCost: string | number): Money {
  return multiply(fromDecimalString(averageCost), quantity);
}

/**
 * Converts a quantity expressed in a packaging unit into the product's base
 * unit. 10 boxes at 12 per box is 120 pieces (SPEC §10).
 */
export function toBaseQuantity(quantity: number, conversionToBase: number): number {
  if (!Number.isFinite(conversionToBase) || conversionToBase <= 0) {
    throw new Error("A unit conversion factor must be greater than zero");
  }
  return quantity * conversionToBase;
}

export function fromBaseQuantity(baseQuantity: number, conversionToBase: number): number {
  if (!Number.isFinite(conversionToBase) || conversionToBase <= 0) {
    throw new Error("A unit conversion factor must be greater than zero");
  }
  return baseQuantity / conversionToBase;
}

/**
 * Margin on a single unit, given selling price and the cost it actually
 * consumed. Never derive profit from the current purchase price (SPEC §20).
 */
export function unitMargin(
  sellingPrice: string | number,
  costPrice: string | number,
): { amount: Money; percent: number | null } {
  const price = fromDecimalString(sellingPrice);
  const cost = fromDecimalString(costPrice);
  const amount = price - cost;
  return {
    amount,
    percent: price === 0 ? null : (amount / price) * 100,
  };
}

export { toDecimalString };
