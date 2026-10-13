import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { STOCK_STATUS_LABEL, stockStatus } from "@/domain/inventory/stock";
import { formatMoney, formatQuantity, type FormatContext } from "@/lib/format";
import type { ProductRow } from "./queries";

const TONE = {
  out_of_stock: "critical",
  low_stock: "caution",
  in_stock: "neutral",
} as const;

export function ProductTable({
  rows,
  ctx,
}: {
  rows: ProductRow[];
  ctx: FormatContext;
}) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Category</Th>
            <Th className="text-right">Stock</Th>
            <Th className="text-right">Cost</Th>
            <Th className="text-right">Price</Th>
            <Th className="text-right">Stock value</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const balance = p.balances?.[0];
            const quantity = Number(balance?.quantity ?? 0);
            const status = p.track_inventory
              ? stockStatus(quantity, Number(p.minimum_stock))
              : null;

            return (
              <Tr key={p.id}>
                <Td>
                  <Link
                    href={`/inventory/products/${p.id}`}
                    className="font-medium text-ink hover:text-accent hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.sku ? (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {p.sku}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-ink-muted">{p.category?.name ?? "—"}</Td>
                <Td className="tabular text-right">
                  {p.track_inventory ? (
                    <>
                      {formatQuantity(quantity, ctx.number_format)}
                      <span className="ml-1 text-xs text-ink-subtle">
                        {p.base_unit?.symbol}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-subtle">Not tracked</span>
                  )}
                </Td>
                <Td className="tabular text-right text-ink-muted">
                  {formatMoney(balance?.average_cost ?? p.purchase_price, ctx)}
                </Td>
                <Td className="tabular text-right">{formatMoney(p.selling_price, ctx)}</Td>
                <Td className="tabular text-right text-ink-muted">
                  {p.track_inventory ? formatMoney(balance?.stock_value ?? 0, ctx) : "—"}
                </Td>
                <Td>
                  {!p.is_active ? (
                    <Badge tone="neutral">Inactive</Badge>
                  ) : status ? (
                    <Badge tone={TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
                  ) : (
                    <Badge tone="neutral">Active</Badge>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
