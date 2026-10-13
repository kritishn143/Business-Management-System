import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Printer, Receipt, Undo2 } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sales" };

type SaleRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  sale_date: string;
  total_amount: string;
  paid_amount: string;
  due_amount: string;
  items: { count: number }[];
};

export default async function SalesPage() {
  const supabase = await createClient();

  const [{ data, error }, memberships] = await Promise.all([
    supabase
      .from("sales")
      .select("id, invoice_number, status, sale_date, total_amount, paid_amount, due_amount, items:sale_items(count)")
      .in("status", ["posted", "partially_returned", "returned"])
      .order("sale_date", { ascending: false })
      .limit(50),
    listMemberships(),
  ]);

  if (error) {
    console.error("[sales] list", error.code, error.message);
    throw new Error("We couldn't load your sales.");
  }

  const rows = (data ?? []) as unknown as SaleRow[];
  const ctx = formatContextOf(memberships[0].business);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sales"
        description="Every invoice and counter sale."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/sales/pending">Waiting to sync</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/sales/returns">
                <Undo2 />
                Returns
              </Link>
            </Button>
            <Button asChild>
              <Link href="/sales/new">
                <Plus />
                New sale
              </Link>
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No sales yet"
          description="Open the counter to record your first sale. Stock, totals and profit update as soon as it's complete."
          action={
            <Button asChild>
              <Link href="/sales/new">Open the counter</Link>
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>When</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Owing</Th>
                <Th>Status</Th>
                <Th className="w-10"><span className="sr-only">Invoice</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const due = Number(s.due_amount);
                return (
                  <Tr key={s.id}>
                    <Td>
                      <Link
                        href={`/sales/${s.id}`}
                        className="font-medium text-ink hover:text-accent hover:underline"
                      >
                        {s.invoice_number}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(s.sale_date, ctx)}
                    </Td>
                    <Td className="tabular text-right text-ink-muted">
                      {s.items?.[0]?.count ?? 0}
                    </Td>
                    <Td className="tabular text-right">{formatMoney(s.total_amount, ctx)}</Td>
                    <Td className="tabular text-right">
                      {due > 0 ? (
                        <span className="text-critical">{formatMoney(s.due_amount, ctx)}</span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </Td>
                    <Td>
                      {s.status === "returned" ? (
                        <Badge tone="critical">Returned</Badge>
                      ) : s.status === "partially_returned" ? (
                        <Badge tone="caution">Partly returned</Badge>
                      ) : due > 0 ? (
                        <Badge tone="caution">Owing</Badge>
                      ) : (
                        <Badge tone="positive">Paid</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/sales/${s.id}/invoice`}
                        title={`Print ${s.invoice_number}`}
                        className="inline-flex rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
                      >
                        <Printer className="size-4" />
                        <span className="sr-only">Print {s.invoice_number}</span>
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
