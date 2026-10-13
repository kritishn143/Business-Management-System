/**
 * Paper the shop actually owns (SPEC §75). Each one is a real print target,
 * not a preview: the page size and margins are emitted as @page rules.
 */
export const INVOICE_FORMATS = {
  a4: {
    label: "A4",
    hint: "Full-page invoice",
    page: "A4",
    margin: "14mm",
    /** Rendered width on screen, so the preview matches the paper. */
    width: "210mm",
    narrow: false,
  },
  a5: {
    label: "A5",
    hint: "Half-page invoice",
    page: "A5",
    margin: "10mm",
    width: "148mm",
    narrow: false,
  },
  "80mm": {
    label: "80mm",
    hint: "Thermal receipt",
    page: "80mm auto",
    margin: "3mm",
    width: "80mm",
    narrow: true,
  },
  "58mm": {
    label: "58mm",
    hint: "Narrow thermal receipt",
    page: "58mm auto",
    margin: "2mm",
    width: "58mm",
    narrow: true,
  },
} as const;

export type InvoiceFormatKey = keyof typeof INVOICE_FORMATS;

export function isInvoiceFormat(value: unknown): value is InvoiceFormatKey {
  return typeof value === "string" && value in INVOICE_FORMATS;
}

/** A4 unless asked otherwise; an unknown value is a typo, not an error. */
export function resolveFormat(value: unknown): InvoiceFormatKey {
  return isInvoiceFormat(value) ? value : "a4";
}
