import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BusinessProfile } from "@/features/businesses/queries";
import type { SaleDetail } from "@/features/sales/queries";
import type { FormatContext } from "@/lib/format";
import type { InvoiceConfig } from "./settings-queries";
import { InvoiceDocument } from "./invoice-document";

const business = {
  id: "b1",
  name: "Sunrise Stationers",
  slug: "sunrise-stationers",
  category: "stationery",
  business_type: "retail",
  phone: "9801234567",
  email: "hello@sunrise.test",
  address: "Putalisadak, Kathmandu",
  registration_number: "PAN-12345",
  currency_code: "NPR",
  currency_position: "before",
  number_format: "en-IN",
  date_format: "dd MMM yyyy",
  timezone: "Asia/Kathmandu",
  date_system: "AD",
  fiscal_year_start_month: 4,
  fiscal_year_start_day: 1,
  created_at: "2026-01-01T00:00:00Z",
} satisfies BusinessProfile;

const ctx: FormatContext = {
  currency_code: "NPR",
  currency_position: "before",
  number_format: "en-IN",
  date_format: "dd MMM yyyy",
  timezone: "Asia/Kathmandu",
  date_system: "AD",
};

const sale = {
  id: "s1",
  invoice_number: "SAL-000042",
  status: "posted",
  sale_date: "2026-09-27T12:30:00Z",
  subtotal: "1200.00",
  discount_amount: "200.00",
  total_amount: "1000.00",
  paid_amount: "600.00",
  due_amount: "400.00",
  notes: "Delivered to the school gate.",
  customer: { id: "c1", name: "Shree Secondary School", phone: "9812345678" },
  items: [
    {
      id: "i1",
      quantity: "12",
      unit_price: "100.00",
      discount_amount: "0.00",
      line_total: "1200.00",
      cost_price: "70.00",
      returned: 0,
      product: { name: "Gel pen, blue" },
      unit: { symbol: "pc" },
    },
  ],
  payments: [{ method: "cash", amount: "600.00" }],
} as unknown as SaleDetail;

const config: InvoiceConfig = {
  business_id: "b1",
  logo_path: null,
  logoUrl: null,
  heading: "Tax invoice",
  terms: "Goods are returnable against this invoice within seven days.",
  footer: null,
  bank_details: "Himalayan Bank · 0123456789",
  signature_label: "Authorised signature",
  show_logo: true,
  show_signature: true,
  show_terms: true,
  show_bank: false,
  show_address_on_receipt: true,
  defaultFormat: "a4",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function render(
  format: "a4" | "a5" | "80mm" | "58mm",
  over: Partial<InvoiceConfig> = {},
) {
  return renderToStaticMarkup(
    <InvoiceDocument
      sale={sale}
      business={business}
      ctx={ctx}
      format={format}
      config={{ ...config, ...over }}
    />,
  );
}

describe("InvoiceDocument", () => {
  it("carries everything a customer needs to identify the sale", () => {
    const html = render("a4");
    expect(html).toContain("Sunrise Stationers");
    expect(html).toContain("Putalisadak, Kathmandu");
    expect(html).toContain("PAN-12345");
    expect(html).toContain("SAL-000042");
    expect(html).toContain("Shree Secondary School");
    expect(html).toContain("Gel pen, blue");
  });

  it("shows money in the shop's own currency and grouping", () => {
    const html = render("a4");
    expect(html).toContain("Rs 1,000.00");
    expect(html).toContain("Rs 1,200.00");
  });

  it("shows the discount and what is still owed", () => {
    const html = render("a4");
    expect(html).toContain("Discount");
    expect(html).toContain("Balance due");
    expect(html).toContain("Rs 400.00");
  });

  it("emits the @page rule for the paper it was asked for", () => {
    expect(render("a4")).toContain("size: A4");
    expect(render("a5")).toContain("size: A5");
    expect(render("80mm")).toContain("size: 80mm auto");
    expect(render("58mm")).toContain("size: 58mm auto");
  });

  it("prints a signature block on paper and a thank-you on a till roll", () => {
    expect(render("a4")).toContain("Authorised signature");
    expect(render("a4")).not.toContain("keep this receipt");
    expect(render("58mm")).toContain("keep this receipt");
    expect(render("58mm")).not.toContain("Authorised signature");
  });

  it("names a walk-in customer rather than leaving the line blank", () => {
    const html = renderToStaticMarkup(
      <InvoiceDocument
        sale={{ ...sale, customer: null } as unknown as SaleDetail}
        business={business}
        ctx={ctx}
        format="a4"
        config={config}
      />,
    );
    expect(html).toContain("Walk-in customer");
  });

  it("omits the discount line when nothing was discounted", () => {
    const html = renderToStaticMarkup(
      <InvoiceDocument
        sale={{ ...sale, discount_amount: "0.00" } as unknown as SaleDetail}
        business={business}
        ctx={ctx}
        format="a4"
        config={config}
      />,
    );
    expect(html).not.toContain("Discount");
  });

  it("stays dark-on-white so a dark theme never prints a black invoice", () => {
    const html = render("a4");
    expect(html).toContain("background:#fff");
    expect(html).toContain("color:#111");
  });
});

describe("InvoiceDocument, as the shop configured it", () => {
  it("uses the shop's own heading", () => {
    expect(render("a4", { heading: "Cash memo" })).toContain("Cash memo");
    expect(render("a4", { heading: "Cash memo" })).not.toContain("Tax invoice");
  });

  it("keeps calling a till roll a receipt, whatever the invoice heading is", () => {
    // A thermal slip is not an invoice, so the heading does not apply to it.
    expect(render("58mm", { heading: "Cash memo" })).toContain("Receipt");
  });

  it("prints the terms, and drops them when switched off", () => {
    expect(render("a4")).toContain("returnable against this invoice");
    expect(render("a4", { show_terms: false })).not.toContain(
      "returnable against this invoice",
    );
    expect(render("a4", { terms: null })).not.toContain("returnable against");
  });

  it("uses the shop's wording on the signature line, or drops the line", () => {
    expect(render("a4", { signature_label: "For Sunrise Stationers" })).toContain(
      "For Sunrise Stationers",
    );
    expect(render("a4", { show_signature: false })).not.toContain(
      "Authorised signature",
    );
  });

  it("prints bank details only when asked for", () => {
    expect(render("a4")).not.toContain("Himalayan Bank");
    const shown = render("a4", { show_bank: true });
    expect(shown).toContain("Himalayan Bank");
    expect(shown).toContain("Payment details");
  });

  it("keeps bank details off a till roll, which has no room for them", () => {
    expect(render("58mm", { show_bank: true })).not.toContain("Himalayan Bank");
  });

  it("prints a footer on paper and as the receipt's parting line", () => {
    expect(render("a4", { footer: "Thank you for your custom." })).toContain(
      "Thank you for your custom.",
    );
    const receipt = render("58mm", { footer: "Thank you for your custom." });
    expect(receipt).toContain("Thank you for your custom.");
    expect(receipt).not.toContain("keep this receipt");
  });

  it("falls back to a sensible parting line when no footer is set", () => {
    expect(render("58mm", { footer: null })).toContain("keep this receipt");
  });

  it("shows the logo when there is one, and not when it is switched off", () => {
    const url = "https://example.test/signed/logo.png";
    expect(render("a4", { logoUrl: url })).toContain(url);
    expect(render("a4", { logoUrl: url, show_logo: false })).not.toContain(url);
    // No logo configured at all: no broken image element.
    expect(render("a4")).not.toContain("<img");
  });

  it("can leave the full address off a narrow receipt", () => {
    expect(render("58mm")).toContain("Putalisadak");
    expect(render("58mm", { show_address_on_receipt: false })).not.toContain(
      "Putalisadak",
    );
    // The setting is about till rolls; an invoice always carries the address.
    expect(render("a4", { show_address_on_receipt: false })).toContain("Putalisadak");
  });
});

