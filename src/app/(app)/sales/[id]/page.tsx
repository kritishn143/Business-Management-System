import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { getSale, listSaleReturns } from "@/features/sales/queries";
import { ReturnDialog } from "@/features/sales/return-dialog";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/sales/[id]">): Promise<Metadata> {
  const { id } = await params;
  const sale = await getSale(id);
  return { title: sale?.invoice_number ?? "Sale" };
}

const STATUS: Record<string, { label: string; tone: "neutral" | "positive" | "caution" | "critical" }> = {
  posted: { label: "Completed", tone: "positive" },
  partially_returned: { label: "Partly returned", tone: "caution" },
  returned: { label: "Returned", tone: "critical" },
  void: { label: "Void", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", bank: "Bank transfer", qr: "QR", card: "Card",
  wallet: "Wallet", credit: "On credit", other: "Other",
};

export default async function SaleDetailPage({ params }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  const sale = await getSale(id);
  if (!sale) notFound();

  const [returns, memberships] = await Promise.all([
    listSaleReturns(id),
    listMemberships(),
  ]);

  const ctx = formatContextOf(memberships[0].business);

  const status = STATUS[sale.status] ?? STATUS.posted;
  const due = Number(sale.due_amount);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/sales"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink print:hidden"
      >
        <ArrowLeft className="size-4" />
        Sales
      </Link>

      <div className="mt-4 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            {sale.invoice_number}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{formatDateTime(sale.sale_date, ctx)}</span>
            {sale.customer ? (
              <span>
                ·{" "}
                <Link
                  href={`/customers/${sale.customer.id}`}
                  className="hover:text-accent hover:underline"
                >
                  {sale.customer.name}
                </Link>
              </span>
            ) : (
              <span>· Walk-in</span>
            )}
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="secondary">
            <Link href={`/sales/${sale.id}/invoice`}>
              <Printer />
              Invoice
            </Link>
          </Button>
          <ReturnDialog
            saleId={sale.id}
            items={sale.items}
            numberFormat={ctx.number_format}
          />
        </div>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i) => (
              <Tr key={i.id}>
                <Td>
                  {i.product?.name ?? "Deleted product"}
                  {i.returned > 0 ? (
                    <span className="ml-2 text-xs text-caution">
                      {formatQuantity(i.returned, ctx.number_format)} returned
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular text-right">
                  {formatQuantity(i.quantity, ctx.number_format)}
                  <span className="ml-1 text-xs text-ink-subtle">{i.unit?.symbol}</span>
                </Td>
                <Td className="tabular text-right text-ink-muted">
                  {formatMoney(i.unit_price, ctx)}
                </Td>
                <Td className="tabular text-right font-medium">
                  {formatMoney(i.line_total, ctx)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <dl className="mt-6 ml-auto max-w-xs space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="tabular">{formatMoney(sale.subtotal, ctx)}</dd>
        </div>
        {Number(sale.discount_amount) > 0 ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Discount</dt>
            <dd className="tabular">−{formatMoney(sale.discount_amount, ctx)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular">{formatMoney(sale.total_amount, ctx)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Paid</dt>
          <dd className="tabular">{formatMoney(sale.paid_amount, ctx)}</dd>
        </div>
        {due > 0 ? (
          <div className="flex justify-between text-critical">
            <dt>Owing</dt>
            <dd className="tabular font-medium">{formatMoney(sale.due_amount, ctx)}</dd>
          </div>
        ) : null}
      </dl>

      {sale.payments.length > 0 ? (
        <p className="mt-4 text-right text-[13px] text-ink-subtle">
          Paid by{" "}
          {sale.payments.map((p) => METHOD_LABEL[p.method] ?? p.method).join(", ")}
        </p>
      ) : null}

      {returns.length > 0 ? (
        <>
          <h2 className="mt-10 mb-4 text-base font-semibold text-ink">Returns</h2>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Return</Th>
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Value</Th>
                  <Th className="text-right">Refunded</Th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.return_number}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(r.return_date as string, ctx)}
                    </Td>
                    <Td className="text-ink-muted">{r.reason ?? "—"}</Td>
                    <Td className="tabular text-right">
                      {formatMoney(r.total_amount as string, ctx)}
                    </Td>
                    <Td className="tabular text-right text-ink-muted">
                      {formatMoney(r.refunded_amount as string, ctx)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      ) : null}
    </div>
  );
}
