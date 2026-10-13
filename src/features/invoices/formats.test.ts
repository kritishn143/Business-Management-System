import { describe, expect, it } from "vitest";
import { INVOICE_FORMATS, isInvoiceFormat, resolveFormat } from "./formats";

describe("invoice formats", () => {
  it("offers the four papers a stationery shop is likely to own", () => {
    expect(Object.keys(INVOICE_FORMATS)).toEqual(["a4", "a5", "80mm", "58mm"]);
  });

  it("treats only thermal rolls as narrow", () => {
    expect(INVOICE_FORMATS["80mm"].narrow).toBe(true);
    expect(INVOICE_FORMATS["58mm"].narrow).toBe(true);
    expect(INVOICE_FORMATS.a4.narrow).toBe(false);
    expect(INVOICE_FORMATS.a5.narrow).toBe(false);
  });

  it("gives every paper an auto-height or fixed page size for @page", () => {
    for (const spec of Object.values(INVOICE_FORMATS)) {
      expect(spec.page).toMatch(/^(A4|A5|\d+mm auto)$/);
      expect(spec.margin).toMatch(/^\d+mm$/);
    }
  });

  it("recognises a known size", () => {
    expect(isInvoiceFormat("a4")).toBe(true);
    expect(isInvoiceFormat("80mm")).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    expect(isInvoiceFormat("A4")).toBe(false);
    expect(isInvoiceFormat("letter")).toBe(false);
    expect(isInvoiceFormat(undefined)).toBe(false);
    expect(isInvoiceFormat(80)).toBe(false);
  });

  it("falls back to A4 rather than failing on a bad query string", () => {
    expect(resolveFormat(undefined)).toBe("a4");
    expect(resolveFormat("nonsense")).toBe("a4");
    // A repeated ?size= arrives as an array, which is not a size either.
    expect(resolveFormat(["a4", "58mm"])).toBe("a4");
  });

  it("honours a size that is asked for", () => {
    expect(resolveFormat("58mm")).toBe("58mm");
    expect(resolveFormat("a5")).toBe("a5");
  });
});
