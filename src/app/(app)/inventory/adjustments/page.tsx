import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock adjustments" };

const REASON_LABEL: Record<string, string> = {
  opening_stock: "Opening stock",
  physical_count: "Physical count",
  damaged: "Damaged",
  lost: "Lost",
  expired: "Expired",
  found: "Found",
  correction: "Correction",
  transfer: "Transfer",
  other: "Other",
};

export default async function AdjustmentsPage() {
  const supabase = await createClient();

  // Adjustments and damage are the movements a person made deliberately, as
  // opposed to those a sale or purchase created (SPEC §12).
  const [{ data, error }, { business }] = await Promise.all([
    supabase
      .from("stock_movements")
      .select(
        "id, movement_type, quantity, unit_cost, reason, notes, created_at, products!stock_movements_product_same_business (id, name, sku)",
      )
      .in("movement_type", ["adjustment", "damage", "opening"])
      .order("created_at", { ascending: false })
      .limit(100),
    loadActiveBusiness(),
  ]);

  if (error) {
    console.error("[adjustments] list", error.code, error.message);
    throw new Error("We couldn't load your stock adjustments.");
  }

  const ctx = formatContextOf(business);

  type Row = {
    id: string;
    movement_type: string;
    quantity: string;
    reason: string | null;
    notes: string | null;
    created_at: string;
    products: { id: string; name: string; sku: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Stock adjustments"
          description="Every deliberate change to stock that was not a sale or a purchase."
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No adjustments yet"
          description="Counting stock, writing off damage or correcting a mistake all appear here, each with its reason."
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Product</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Change</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const quantity = Number(row.quantity);
                  return (
                    <Tr key={row.id}>
                      <Td className="whitespace-nowrap text-ink-muted">
                        {formatDateTime(row.created_at, ctx)}
                      </Td>
                      <Td>
                        {row.products ? (
                          <Link
                            href={`/inventory/products/${row.products.id}`}
                            className="font-medium text-ink hover:text-accent hover:underline"
                          >
                            {row.products.name}
                          </Link>
                        ) : (
                          <span className="text-ink-subtle">Deleted product</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={row.movement_type === "damage" ? "critical" : "neutral"}>
                          {REASON_LABEL[row.reason ?? ""] ??
                            (row.movement_type === "opening" ? "Opening stock" : "Adjustment")}
                        </Badge>
                      </Td>
                      <Td
                        className={
                          "tabular text-right font-medium " +
                          (quantity < 0 ? "text-critical" : "text-positive")
                        }
                      >
                        {quantity > 0 ? "+" : ""}
                        {formatQuantity(row.quantity, ctx.number_format)}
                      </Td>
                      <Td className="text-ink-muted">{row.notes ?? "—"}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-[13px] text-ink-subtle">
            Stock movements are immutable. A mistake is corrected with another
            adjustment, never by editing this history.
          </p>
        </>
      )}
    </div>
  );
}
