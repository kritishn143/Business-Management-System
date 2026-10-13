import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShoppingCart, Undo2 } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Purchases" };

type PurchaseRow = {
  id: string;
  invoice_number: string | null;
  supplier_invoice: string | null;
  purchase_date: string;
  total_amount: string;
  due_amount: string;
  supplier: { name: string } | null;
  items: { count: number }[];
};

export default async function PurchasesPage() {
  const supabase = await createClient();

  const [{ data, error }, memberships] = await Promise.all([
    supabase
      .from("purchases")
      .select(`
        id, invoice_number, supplier_invoice, purchase_date, total_amount, due_amount,
        supplier:parties!purchases_supplier_same_business (name),
        items:purchase_items(count)
      `)
      .eq("status", "posted")
      .order("purchase_date", { ascending: false })
      .limit(50),
    listMemberships(),
  ]);

  if (error) {
    console.error("[purchases] list", error.code, error.message);
    throw new Error("We couldn't load your purchases.");
  }

  const rows = (data ?? []) as unknown as PurchaseRow[];
  const ctx = formatContextOf(memberships[0].business);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Purchases"
        description="What you bought, from whom, and what you still owe."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/purchases/returns">
                <Undo2 />
                Returns
              </Link>
            </Button>
            <Button asChild>
              <Link href="/purchases/new">
                <Plus />
                Record purchase
              </Link>
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchases yet"
          description="Record a bill when stock arrives. Quantities and costs flow straight into your inventory."
          action={
            <Button asChild>
              <Link href="/purchases/new">Record your first bill</Link>
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Supplier</Th>
                <Th>When</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Owing</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const due = Number(p.due_amount);
                return (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {p.invoice_number}
                      {p.supplier_invoice ? (
                        <span className="mt-0.5 block text-xs text-ink-subtle">
                          their ref {p.supplier_invoice}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-ink-muted">{p.supplier?.name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(p.purchase_date, ctx)}
                    </Td>
                    <Td className="tabular text-right text-ink-muted">
                      {p.items?.[0]?.count ?? 0}
                    </Td>
                    <Td className="tabular text-right">{formatMoney(p.total_amount, ctx)}</Td>
                    <Td className="tabular text-right">
                      {due > 0 ? (
                        <span className="text-critical">{formatMoney(p.due_amount, ctx)}</span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </Td>
                    <Td>
                      {due > 0 ? (
                        <Badge tone="caution">Owing</Badge>
                      ) : (
                        <Badge tone="positive">Paid</Badge>
                      )}
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
