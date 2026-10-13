import { z } from "zod";

export const ADJUSTMENT_REASONS = [
  { value: "physical_count", label: "Physical count", hint: "Correcting to what you actually counted" },
  { value: "damaged", label: "Damaged", hint: "Broken or spoiled stock" },
  { value: "lost", label: "Lost", hint: "Missing or stolen" },
  { value: "expired", label: "Expired", hint: "Past its usable date" },
  { value: "found", label: "Found", hint: "Stock that turned up" },
  { value: "correction", label: "Correction", hint: "Fixing an earlier mistake" },
  { value: "other", label: "Other", hint: "Anything else — add a note" },
] as const;

/** Reasons that may only ever reduce stock. */
const REDUCING = new Set(["damaged", "lost", "expired"]);

export const adjustStockSchema = z
  .object({
    productId: z.string().uuid(),
    direction: z.enum(["increase", "decrease"]),
    quantity: z
      .string()
      .trim()
      .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), "Enter a quantity like 10")
      .transform(Number)
      .refine((v) => v > 0, "Enter a quantity greater than zero"),
    reason: z.enum(ADJUSTMENT_REASONS.map((r) => r.value) as [string, ...string[]]),
    notes: z
      .string()
      .trim()
      .max(500, "Keep the note under 500 characters.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine((v) => !(REDUCING.has(v.reason) && v.direction === "increase"), {
    path: ["direction"],
    message: "Damaged, lost and expired stock can only reduce your count.",
  })
  .refine((v) => !(v.reason === "other" && !v.notes), {
    path: ["notes"],
    message: "Add a note explaining this adjustment.",
  });
