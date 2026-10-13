import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STOCK_STATUS_LABEL, stockStatus, unitMargin } from "@/domain/inventory/stock";
import { toDecimalString } from "@/domain/money/decimal";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { MovementTimeline } from "@/features/products/movement-timeline";
import { AdjustStockDialog } from "@/features/inventory/adjust-stock-dialog";
import { getProduct, listMovements } from "@/features/products/queries";
import { formatMoney, formatQuantity } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/inventory/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product?.name ?? "Product" };
}

const TONE = {
  out_of_stock: "critical",
  low_stock: "caution",
  in_stock: "positive",
} as const;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[13px] text-ink-muted">{label}</p>
        <p className="tabular mt-1.5 text-xl font-semibold tracking-tight text-ink">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function ProductDetailPage({
  params,
}: PageProps<"/inventory/products/[id]">) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [movements, memberships] = await Promise.all([
    listMovements(id),
    listMemberships(),
  ]);

  const ctx = formatContextOf(memberships[0].business);

  const balance = product.balances?.[0];
  const quantity = Number(balance?.quantity ?? 0);
  const averageCost = balance?.average_cost ?? product.purchase_price;
  const status = product.track_inventory
    ? stockStatus(quantity, Number(product.minimum_stock))
    : null;
  const margin = unitMargin(product.selling_price, averageCost);
  const unitSymbol = product.base_unit?.symbol ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <div className="mt-4 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            {product.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            {product.sku ? <span>SKU {product.sku}</span> : null}
            {product.barcode ? <span>· {product.barcode}</span> : null}
            {product.category ? <span>· {product.category.name}</span> : null}
            {status ? (
              <Badge tone={TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
            ) : null}
            {!product.is_active ? <Badge tone="neutral">Inactive</Badge> : null}
          </div>
        </div>

        {product.track_inventory ? (
          <AdjustStockDialog
            productId={product.id}
            productName={product.name}
            unitSymbol={unitSymbol}
            currentQuantity={formatQuantity(quantity, ctx.number_format)}
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="In stock"
          value={
            product.track_inventory
              ? `${formatQuantity(quantity, ctx.number_format)} ${unitSymbol}`
              : "Not tracked"
          }
          hint={
            product.track_inventory && Number(product.minimum_stock) > 0
              ? `Warn below ${formatQuantity(product.minimum_stock, ctx.number_format)}`
              : undefined
          }
        />
        <Stat
          label="Stock value"
          value={product.track_inventory ? formatMoney(balance?.stock_value ?? 0, ctx) : "—"}
          hint={product.track_inventory ? `at ${formatMoney(averageCost, ctx)} average` : undefined}
        />
        <Stat label="Selling price" value={formatMoney(product.selling_price, ctx)} />
        <Stat
          label="Margin per unit"
          value={formatMoney(toDecimalString(margin.amount), ctx)}
          hint={margin.percent === null ? undefined : `${margin.percent.toFixed(1)}%`}
        />
      </div>

      <h2 className="mt-10 mb-4 text-base font-semibold text-ink">Stock history</h2>

      {movements.length === 0 ? (
        <EmptyState
          icon={History}
          title="No stock movements yet"
          description="Every purchase, sale and adjustment for this product will appear here, oldest change never overwritten."
        />
      ) : (
        <MovementTimeline movements={movements} unitSymbol={unitSymbol} ctx={ctx} />
      )}
    </div>
  );
}
