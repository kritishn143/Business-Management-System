import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { INVOICE_FORMATS, resolveFormat } from "@/features/invoices/formats";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { PrintButton } from "@/features/invoices/print-controls";
import { loadInvoiceConfig } from "@/features/invoices/settings-queries";
import { getSale } from "@/features/sales/queries";

export async function generateMetadata({
  params,
}: PageProps<"/sales/[id]/invoice">): Promise<Metadata> {
  const { id } = await params;
  const sale = await getSale(id);
  return { title: sale ? `${sale.invoice_number} — invoice` : "Invoice" };
}

export default async function InvoicePage({
  params,
  searchParams,
}: PageProps<"/sales/[id]/invoice">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const sale = await getSale(id);
  if (!sale) notFound();

  const { business } = await loadActiveBusiness();
  const config = await loadInvoiceConfig(business.id);
  const ctx = formatContextOf(business);

  // The shop's chosen paper unless this link asks for another (SPEC §21).
  const format = query.size ? resolveFormat(query.size) : config.defaultFormat;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Everything outside the document is screen-only. */}
      <div className="print:hidden">
        <Link
          href={`/sales/${sale.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          {sale.invoice_number}
        </Link>

        <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Invoice</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">
              Choose the paper you print on. The preview below is the real thing.
            </p>
          </div>
          <PrintButton />
        </div>

        <div
          role="group"
          aria-label="Paper size"
          className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface-sunken p-1"
        >
          {Object.entries(INVOICE_FORMATS).map(([key, spec]) => {
            const active = key === format;
            return (
              <Link
                key={key}
                href={`/sales/${sale.id}/invoice?size=${key}`}
                aria-current={active ? "page" : undefined}
                title={spec.hint}
                scroll={false}
                className={
                  active
                    ? "rounded-md bg-surface px-3 py-1.5 text-[13px] font-medium text-ink shadow-xs"
                    : "rounded-md px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
                }
              >
                {spec.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* The paper itself, on a canvas that reads as a desk in either theme. */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-sunken p-4 sm:p-8 print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <div className="mx-auto w-fit shadow-sm print:shadow-none">
          <InvoiceDocument
            sale={sale}
            business={business}
            ctx={ctx}
            format={format}
            config={config}
          />
        </div>
      </div>
    </div>
  );
}
