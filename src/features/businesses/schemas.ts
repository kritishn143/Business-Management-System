import { z } from "zod";

export const BUSINESS_TYPES = [
  { value: "retail", label: "Retail shop" },
  { value: "wholesale", label: "Wholesale" },
  { value: "both", label: "Retail and wholesale" },
  { value: "service", label: "Service" },
] as const;

export const BUSINESS_CATEGORIES = [
  { value: "stationery", label: "Stationery" },
  { value: "bookshop", label: "Bookshop" },
  { value: "printing", label: "Printing and photocopy" },
  { value: "gifts", label: "Gifts and novelty" },
  { value: "general", label: "General store" },
  { value: "other", label: "Something else" },
] as const;

/** Currencies the number formatter is known to handle correctly. */
export const CURRENCIES = [
  { value: "NPR", label: "Nepalese rupee (NPR)" },
  { value: "INR", label: "Indian rupee (INR)" },
  { value: "USD", label: "US dollar (USD)" },
  { value: "GBP", label: "Pound sterling (GBP)" },
  { value: "EUR", label: "Euro (EUR)" },
] as const;

export const TIMEZONES = [
  { value: "Asia/Kathmandu", label: "Kathmandu (GMT+5:45)" },
  { value: "Asia/Kolkata", label: "Kolkata (GMT+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York" },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((i) => i.value) as [string, ...string[]];

export const createBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your shop a name.")
    .max(120, "That name is too long."),
  businessType: z.enum(values(BUSINESS_TYPES)),
  category: z.enum(values(BUSINESS_CATEGORIES)),
  currencyCode: z.enum(values(CURRENCIES)),
  timezone: z.enum(values(TIMEZONES)),
  dateSystem: z.enum(["AD", "BS"]),
  locationName: z
    .string()
    .trim()
    .max(80, "That name is too long.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "Main counter")),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
