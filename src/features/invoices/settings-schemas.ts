import { z } from "zod";
import { INVOICE_FORMATS } from "./formats";

/** Images a browser will reliably render on paper. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const LOGO_MAX_BYTES = 1024 * 1024;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable();

export const invoiceSettingsSchema = z.object({
  heading: z
    .string()
    .trim()
    .min(1, "Give the document a heading, like Invoice or Bill.")
    .max(60, "That heading is too long to fit."),
  terms: optionalText(1000, "Those terms are too long."),
  footer: optionalText(300, "That footer is too long."),
  bankDetails: optionalText(500, "Those bank details are too long."),
  signatureLabel: z
    .string()
    .trim()
    .min(1, "Give the signature line a label.")
    .max(60, "That label is too long."),
  showLogo: z.coerce.boolean(),
  showSignature: z.coerce.boolean(),
  showTerms: z.coerce.boolean(),
  showBank: z.coerce.boolean(),
  showAddressOnReceipt: z.coerce.boolean(),
  defaultFormat: z.enum(
    Object.keys(INVOICE_FORMATS) as [string, ...string[]],
  ),
});

export type InvoiceSettingsInput = z.infer<typeof invoiceSettingsSchema>;

/** What a logo file must be, checked before it is ever uploaded. */
export function validateLogo(file: { type: string; size: number; name: string }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > LOGO_MAX_BYTES) return "Logos must be 1 MB or smaller.";
  if (!LOGO_TYPES.includes(file.type)) {
    return "Use a PNG, JPEG, WebP or SVG image.";
  }
  return null;
}

/** The extension to store the logo under, from its type rather than its name. */
export function logoExtension(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}
