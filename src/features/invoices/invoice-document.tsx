import type { FormatContext } from "@/lib/format";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import type { BusinessProfile } from "@/features/businesses/queries";
import type { SaleDetail } from "@/features/sales/queries";
import { INVOICE_FORMATS, type InvoiceFormatKey } from "./formats";
import type { InvoiceConfig } from "./settings-queries";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  qr: "QR",
  card: "Card",
  wallet: "Wallet",
  credit: "On credit",
  other: "Other",
};

/**
 * The printed artefact. Deliberately independent of the app's theme tokens:
 * an invoice is ink on paper, so it is always dark-on-white whatever the screen
 * is set to (SPEC §21, §75).
 */
export function InvoiceDocument({
  sale,
  business,
  ctx,
  format,
  config,
}: {
  sale: SaleDetail;
  business: BusinessProfile;
  ctx: FormatContext;
  format: InvoiceFormatKey;
  /** How this shop has configured its invoices (SPEC §21). */
  config: InvoiceConfig;
}) {
  const spec = INVOICE_FORMATS[format];
  const narrow = spec.narrow;
  const due = Number(sale.due_amount);
  const discount = Number(sale.discount_amount);

  return (
    <>
      {/* One @page rule for the whole document: this route prints nothing else. */}
      <style>{`
        @page { size: ${spec.page}; margin: ${spec.margin}; }
        @media print {
          html, body { background: #fff !important; }
          .inv { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: auto !important; padding: 0 !important; }
        }
      `}</style>

      <article
        className="inv"
        style={{
          width: spec.width,
          maxWidth: "100%",
          margin: "0 auto",
          padding: narrow ? "10px 12px" : "24px 28px",
          background: "#fff",
          color: "#111",
          fontSize: narrow ? 11 : 13,
          lineHeight: 1.45,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <header
          style={{
            display: narrow ? "block" : "flex",
            justifyContent: "space-between",
            gap: 24,
            textAlign: narrow ? "center" : "left",
            borderBottom: "1px solid #ddd",
            paddingBottom: narrow ? 8 : 16,
          }}
        >
          <div>
            {config.show_logo && config.logoUrl ? (
              // A plain img, not next/image: this document is printed, the
              // source is a short-lived signed URL rather than a static asset,
              // and the optimiser's wrapper markup would only get in the way.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.logoUrl}
                alt=""
                style={{
                  maxHeight: narrow ? 34 : 56,
                  maxWidth: narrow ? 140 : 200,
                  marginBottom: 6,
                  objectFit: "contain",
                }}
              />
            ) : null}
            <h1
              style={{
                fontSize: narrow ? 15 : 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {business.name}
            </h1>
            <div style={{ color: "#555", marginTop: 3, whiteSpace: "pre-line" }}>
              {[
                narrow && !config.show_address_on_receipt ? null : business.address,
                business.phone,
                business.email,
              ]
                .filter(Boolean)
                .join(narrow ? "\n" : " · ")}
            </div>
            {business.registration_number ? (
              <div style={{ color: "#555", marginTop: 2 }}>
                Reg. {business.registration_number}
              </div>
            ) : null}
          </div>

          <div style={{ textAlign: narrow ? "center" : "right", marginTop: narrow ? 8 : 0 }}>
            <div
              style={{
                fontSize: narrow ? 11 : 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#666",
              }}
            >
              {narrow ? "Receipt" : config.heading}
            </div>
            <div style={{ fontSize: narrow ? 13 : 16, fontWeight: 600, marginTop: 2 }}>
              {sale.invoice_number}
            </div>
            <div style={{ color: "#555", marginTop: 2 }}>
              {formatDateTime(sale.sale_date, ctx)}
            </div>
          </div>
        </header>

        <section style={{ margin: narrow ? "8px 0" : "16px 0" }}>
          <span style={{ color: "#666" }}>Billed to </span>
          <span style={{ fontWeight: 600 }}>
            {sale.customer?.name ?? "Walk-in customer"}
          </span>
          {sale.customer?.phone ? (
            <span style={{ color: "#555" }}> · {sale.customer.phone}</span>
          ) : null}
        </section>

        {narrow ? (
          <ReceiptLines sale={sale} ctx={ctx} />
        ) : (
          <InvoiceTable sale={sale} ctx={ctx} />
        )}

        <section
          style={{
            marginTop: narrow ? 8 : 16,
            marginLeft: narrow ? 0 : "auto",
            width: narrow ? "100%" : 260,
          }}
        >
          <Line label="Subtotal" value={formatMoney(sale.subtotal, ctx)} />
          {discount > 0 ? (
            <Line label="Discount" value={`−${formatMoney(sale.discount_amount, ctx)}`} />
          ) : null}
          <Line
            label="Total"
            value={formatMoney(sale.total_amount, ctx)}
            strong
            size={narrow ? 13 : 15}
          />
          <Line label="Paid" value={formatMoney(sale.paid_amount, ctx)} />
          {due > 0 ? (
            <Line label="Balance due" value={formatMoney(sale.due_amount, ctx)} strong />
          ) : null}
        </section>

        {sale.payments.length > 0 ? (
          <p style={{ color: "#555", marginTop: 8, textAlign: narrow ? "center" : "right" }}>
            Paid by {sale.payments.map((p) => METHOD_LABEL[p.method] ?? p.method).join(", ")}
          </p>
        ) : null}

        {sale.notes ? (
          <p style={{ color: "#555", marginTop: narrow ? 8 : 16, whiteSpace: "pre-line" }}>
            {sale.notes}
          </p>
        ) : null}

        {config.show_bank && config.bank_details && !narrow ? (
          <section
            style={{
              marginTop: 16,
              paddingTop: 10,
              borderTop: "1px solid #eee",
              color: "#555",
              whiteSpace: "pre-line",
            }}
          >
            <span style={{ color: "#111", fontWeight: 600 }}>Payment details</span>
            {"\n"}
            {config.bank_details}
          </section>
        ) : null}

        {narrow ? (
          <p style={{ textAlign: "center", marginTop: 12, color: "#555" }}>
            {config.footer ?? "Thank you — please keep this receipt for returns."}
          </p>
        ) : (
          <footer
            style={{
              marginTop: 40,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 24,
            }}
          >
            {config.show_terms && config.terms ? (
              <p style={{ color: "#666", maxWidth: 320, margin: 0, whiteSpace: "pre-line" }}>
                {config.terms}
              </p>
            ) : (
              <span />
            )}
            {config.show_signature ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #999", width: 180, paddingTop: 4 }}>
                  {config.signature_label}
                </div>
              </div>
            ) : null}
          </footer>
        )}

        {config.footer && !narrow ? (
          <p
            style={{
              marginTop: 16,
              paddingTop: 8,
              borderTop: "1px solid #eee",
              color: "#666",
              textAlign: "center",
            }}
          >
            {config.footer}
          </p>
        ) : null}
      </article>
    </>
  );
}

function Line({
  label,
  value,
  strong,
  size,
}: {
  label: string;
  value: string;
  strong?: boolean;
  size?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "2px 0",
        fontWeight: strong ? 600 : 400,
        fontSize: size,
        borderTop: strong ? "1px solid #ddd" : undefined,
        marginTop: strong ? 4 : 0,
        paddingTop: strong ? 4 : 2,
      }}
    >
      <span style={{ color: strong ? "#111" : "#666" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvoiceTable({ sale, ctx }: { sale: SaleDetail; ctx: FormatContext }) {
  const th: React.CSSProperties = {
    textAlign: "left",
    borderBottom: "1px solid #ddd",
    padding: "6px 4px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#666",
    fontWeight: 500,
  };
  const td: React.CSSProperties = {
    padding: "6px 4px",
    borderBottom: "1px solid #f0f0f0",
    verticalAlign: "top",
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={th}>Item</th>
          <th style={{ ...th, textAlign: "right" }}>Qty</th>
          <th style={{ ...th, textAlign: "right" }}>Price</th>
          <th style={{ ...th, textAlign: "right" }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {sale.items.map((i) => (
          <tr key={i.id}>
            <td style={td}>{i.product?.name ?? "Item"}</td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
              {formatQuantity(i.quantity, ctx.number_format)}
              {i.unit?.symbol ? (
                <span style={{ color: "#777" }}> {i.unit.symbol}</span>
              ) : null}
            </td>
            <td style={{ ...td, textAlign: "right" }}>{formatMoney(i.unit_price, ctx)}</td>
            <td style={{ ...td, textAlign: "right" }}>{formatMoney(i.line_total, ctx)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Thermal paper is too narrow for columns, so each line gets two rows. */
function ReceiptLines({ sale, ctx }: { sale: SaleDetail; ctx: FormatContext }) {
  return (
    <div style={{ borderTop: "1px dashed #bbb", paddingTop: 6 }}>
      {sale.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 6 }}>
          <div>{i.product?.name ?? "Item"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#555" }}>
            <span>
              {formatQuantity(i.quantity, ctx.number_format)}
              {i.unit?.symbol ? ` ${i.unit.symbol}` : ""} × {formatMoney(i.unit_price, ctx)}
            </span>
            <span style={{ color: "#111" }}>{formatMoney(i.line_total, ctx)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
