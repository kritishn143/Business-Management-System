import { z } from "zod";

/** Accepts an empty form field as "not provided" rather than as zero. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v : null))
  .nullable();

const price = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v : "0"))
  .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), "Enter an amount like 25 or 25.50")
  .transform(Number)
  .refine((v) => v >= 0, "Prices cannot be negative");

const quantity = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v : "0"))
  .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), "Enter a number like 10")
  .transform(Number)
  .refine((v) => v >= 0, "Cannot be negative");

export const productSchema = z
  .object({
    name: z.string().trim().min(1, "Give the product a name.").max(160),
    sku: optionalText,
    barcode: optionalText,
    categoryId: z
      .string()
      .trim()
      .transform((v) => (v.length > 0 ? v : null))
      .nullable(),
    baseUnitId: z.string().uuid("Choose a unit."),
    purchasePrice: price,
    sellingPrice: price,
    minimumStock: quantity,
    openingStock: quantity,
    trackInventory: z.coerce.boolean(),
  })
  .refine((v) => !(v.openingStock > 0 && !v.trackInventory), {
    path: ["openingStock"],
    message: "Turn on stock tracking to record opening stock.",
  });

export type ProductInput = z.infer<typeof productSchema>;
