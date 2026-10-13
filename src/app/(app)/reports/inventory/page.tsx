import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { STOCK_STATUS_LABEL, stockStatus } from "@/domain/inventory/stock";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatMoney, formatQuantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock valuation" };

const TONE = {
  out_of_stock: "critical",
  low_stock: "caution",
  in_stock: "neutral",
} as const;

type Row = {
  id: string;
  name: string;
  sku: string | null;
  minimum_stock: string;
  track_inventory: boolean;
  base_unit: { symbol: string } | null;
  balances: { quantity: string; average_cost: string; stock_value: string }[];
};

export default async function InventoryReportPage() {
  const supabase = await createClient();

  const [{ data, error }, memberships] = await Promise.all([
    supabase
      .from("products")
      .select(`
        id, name, sku, minimum_stock, track_inventory,
        base_unit:units!products_base_unit_same_business (symbol),
        balances:inventory_balances (quantity, average_cost, stock_value)
      `)
      .eq("is_active", true)
      .eq("track_inventory", true)
      .order("name"),
    listMemberships(),
  ]);

  if (error) {
    console.error("[reports] inventory", error.code, error.message);
    throw new Error("We couldn't build that report.");
  }

  const rows = (data ?? []) as unknown as Row[];
  const ctx = formatContextOf(memberships[0].business);

  const totalValue = rows.reduce(
    (t, r) => t + Number(r.balances?.[0]?.stock_value ?? 0),
    0,
  );
  const lowOrOut = rows.filter((r) => {
    const q = Number(r.balances?.[0]?.quantity ?? 0);
    return stockStatus(q, Number(r.minimum_stock)) !== "in_stock";
  }).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink print:hidden"
      >
        <ArrowLeft className="size-4" />
        Reports
      </Link>

      <h1 className="mt-4 mb-6 text-[28px] font-semibold tracking-tight text-ink">
        Stock valuation
      </h1>

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing to value yet"
          description="Add products that track stock, and their value will be summarised here at weighted-average cost."
        />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">Total stock value</p>
                <p className="tabular mt-1.5 text-xl font-semibold text-ink">
                  {formatMoney(totalValue, ctx)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">At weighted-average cost</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">Products tracked</p>
                <p className="tabular mt-1.5 text-xl font-semibold text-ink">
                  {rows.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-[13px] text-ink-muted">Low or out of stock</p>
                <p className="tabular mt-1.5 text-xl font-semibold text-ink">{lowOrOut}</p>
              </CardContent>
            </Card>
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">In stock</Th>
                  <Th className="text-right">Average cost</Th>
                  <Th className="text-right">Value</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.balances?.[0];
                  const qty = Number(b?.quantity ?? 0);
                  const status = stockStatus(qty, Number(r.minimum_stock));
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Link
                          href={`/inventory/products/${r.id}`}
                          className="font-medium text-ink hover:text-accent hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.sku ? (
                          <span className="mt-0.5 block text-xs text-ink-subtle">
                            {r.sku}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right">
                        {formatQuantity(qty, ctx.number_format)}
                        <span className="ml-1 text-xs text-ink-subtle">
                          {r.base_unit?.symbol}
                        </span>
                      </Td>
                      <Td className="tabular text-right text-ink-muted">
                        {formatMoney(b?.average_cost ?? 0, ctx)}
                      </Td>
                      <Td className="tabular text-right font-medium">
                        {formatMoney(b?.stock_value ?? 0, ctx)}
                      </Td>
                      <Td>
                        <Badge tone={TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </div>
  );
}
