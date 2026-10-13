import { z } from "zod";
import { BUSINESS_CATEGORIES, BUSINESS_TYPES } from "@/features/businesses/schemas";

/** Number formats the Intl-based formatters are known to render well. */
export const NUMBER_FORMATS = [
  { value: "en-IN", label: "1,23,456.78 — South Asian grouping" },
  { value: "en-US", label: "123,456.78 — Western grouping" },
  { value: "de-DE", label: "123.456,78 — dot grouping" },
  { value: "fr-FR", label: "123 456,78 — space grouping" },
] as const;

export const CURRENCY_POSITIONS = [
  { value: "before", label: "Before the amount — Rs 1,200.00" },
  { value: "after", label: "After the amount — 1,200.00 Rs" },
] as const;

export const DATE_SYSTEMS = [
  { value: "AD", label: "Gregorian (AD)" },
  { value: "BS", label: "Bikram Sambat (BS)" },
] as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Roles an admin can assign. Ownership is handled separately and guarded. */
export const ASSIGNABLE_ROLES = [
  { value: "manager", label: "Manager", hint: "Everything except ownership." },
  { value: "cashier", label: "Cashier", hint: "Sells at the counter and takes payments." },
  { value: "inventory_manager", label: "Inventory manager", hint: "Products, stock and adjustments." },
  { value: "accountant", label: "Accountant", hint: "Money, parties and reports." },
  { value: "owner", label: "Owner", hint: "Full control, including other owners." },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((i) => i.value) as [string, ...string[]];

/** Optional text fields arrive as "" from an untouched input; store null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable();

export const businessProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Your shop needs a name.")
    .max(120, "That name is too long."),
  businessType: z.enum(values(BUSINESS_TYPES)),
  category: z.enum(values(BUSINESS_CATEGORIES)),
  phone: optionalText(40, "That phone number is too long."),
  email: z
    .union([z.literal(""), z.string().trim().email("That doesn't look like an email address.")])
    .transform((v) => (v && v.length > 0 ? v : null)),
  address: optionalText(400, "That address is too long."),
  registrationNumber: optionalText(60, "That registration number is too long."),
});

export const localizationSchema = z.object({
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like NPR."),
  currencyPosition: z.enum(values(CURRENCY_POSITIONS)),
  numberFormat: z.enum(values(NUMBER_FORMATS)),
  timezone: z
    .string()
    .trim()
    .min(1, "Choose a time zone.")
    .max(60, "That time zone name is too long."),
  dateSystem: z.enum(values(DATE_SYSTEMS)),
  fiscalYearStartMonth: z.coerce
    .number()
    .int()
    .min(1, "Choose a month.")
    .max(12, "Choose a month."),
  fiscalYearStartDay: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "The day must be between 1 and 31.")
    .max(31, "The day must be between 1 and 31."),
});


/** Longest each month can be, so 30 February is refused before Postgres sees it. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const localizationFormSchema = localizationSchema.refine(
  (v) => v.fiscalYearStartDay <= DAYS_IN_MONTH[v.fiscalYearStartMonth - 1],
  {
    path: ["fiscalYearStartDay"],
    message: "That month is shorter than that.",
  },
);

export const memberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(values(ASSIGNABLE_ROLES)),
});

export const memberStatusSchema = z.object({
  memberId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type LocalizationInput = z.infer<typeof localizationSchema>;
