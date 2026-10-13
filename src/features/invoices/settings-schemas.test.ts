import { describe, expect, it } from "vitest";
import {
  LOGO_MAX_BYTES,
  invoiceSettingsSchema,
  logoExtension,
  validateLogo,
} from "./settings-schemas";

const base = {
  heading: "Tax invoice",
  terms: "",
  footer: "",
  bankDetails: "",
  signatureLabel: "Authorised signature",
  showLogo: true,
  showSignature: true,
  showTerms: true,
  showBank: false,
  showAddressOnReceipt: true,
  defaultFormat: "a4",
};

describe("invoiceSettingsSchema", () => {
  it("stores untouched optional fields as null rather than empty text", () => {
    const parsed = invoiceSettingsSchema.parse(base);
    expect(parsed.terms).toBeNull();
    expect(parsed.footer).toBeNull();
    expect(parsed.bankDetails).toBeNull();
  });

  it("trims what was typed", () => {
    const parsed = invoiceSettingsSchema.parse({ ...base, heading: "  Cash memo  " });
    expect(parsed.heading).toBe("Cash memo");
  });

  it("refuses a blank heading, which would leave the invoice unlabelled", () => {
    expect(invoiceSettingsSchema.safeParse({ ...base, heading: "   " }).success).toBe(
      false,
    );
  });

  it("refuses a blank signature label", () => {
    expect(
      invoiceSettingsSchema.safeParse({ ...base, signatureLabel: " " }).success,
    ).toBe(false);
  });

  it("refuses a heading too long to fit on the page", () => {
    expect(
      invoiceSettingsSchema.safeParse({ ...base, heading: "x".repeat(61) }).success,
    ).toBe(false);
  });

  it("accepts every paper we can actually print", () => {
    for (const format of ["a4", "a5", "80mm", "58mm"]) {
      expect(invoiceSettingsSchema.safeParse({ ...base, defaultFormat: format }).success).toBe(
        true,
      );
    }
  });

  it("refuses a paper we cannot", () => {
    expect(
      invoiceSettingsSchema.safeParse({ ...base, defaultFormat: "letter" }).success,
    ).toBe(false);
  });

  it("keeps multi-line payment details intact", () => {
    const parsed = invoiceSettingsSchema.parse({
      ...base,
      bankDetails: "Himalayan Bank\nSunrise Stationers\n0123456789",
    });
    expect(parsed.bankDetails).toBe(
      "Himalayan Bank\nSunrise Stationers\n0123456789",
    );
  });
});

describe("validateLogo", () => {
  const file = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
    type: "image/png",
    size: 5_000,
    name: "logo.png",
    ...over,
  });

  it("accepts the image types a browser prints reliably", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateLogo(file({ type }))).toBeNull();
    }
  });

  it("refuses something that is not an image", () => {
    expect(validateLogo(file({ type: "application/pdf" }))).toContain("PNG");
    expect(validateLogo(file({ type: "text/html" }))).toContain("PNG");
  });

  it("refuses an empty file", () => {
    expect(validateLogo(file({ size: 0 }))).toContain("empty");
  });

  it("refuses one over the size limit", () => {
    expect(validateLogo(file({ size: LOGO_MAX_BYTES + 1 }))).toContain("1 MB");
    expect(validateLogo(file({ size: LOGO_MAX_BYTES }))).toBeNull();
  });
});

describe("logoExtension", () => {
  it("names the file from its type, not from what the user called it", () => {
    // A file called "logo.png" that is really a JPEG should be stored as .jpg.
    expect(logoExtension("image/jpeg")).toBe("jpg");
    expect(logoExtension("image/png")).toBe("png");
    expect(logoExtension("image/webp")).toBe("webp");
    expect(logoExtension("image/svg+xml")).toBe("svg");
  });

  it("falls back rather than inventing an extension", () => {
    expect(logoExtension("application/octet-stream")).toBe("bin");
  });
});
