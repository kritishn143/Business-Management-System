import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boxes, FileUp, Plus, SearchX } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { ProductSearch } from "@/features/products/product-search";
import { ProductTable } from "@/features/products/product-table";
import { PRODUCTS_PAGE_SIZE, listProducts } from "@/features/products/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inventory" };

async function ProductList({ search, page }: { search?: string; page: number }) {
  const [{ rows, total }, memberships] = await Promise.all([
    listProducts({ search, page }),
    listMemberships(),
  ]);

  const ctx = formatContextOf(memberships[0].business);

  if (rows.length === 0) {
    return search ? (
      <EmptyState
        icon={SearchX}
        title={`Nothing matches “${search}”`}
        description="Try a shorter search, or check the spelling of the name, SKU or barcode."
      />
    ) : (
      <EmptyState
        icon={Boxes}
        title="No products yet"
        description="Add your first item to start tracking stock, costs and sales — or bring a whole catalogue in from a spreadsheet."
        action={
          <>
            <Button asChild>
              <Link href="/inventory/products/new">Add your first product</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/inventory/products/import">Import a CSV</Link>
            </Button>
          </>
        }
      />
    );
  }

  const pages = Math.ceil(total / PRODUCTS_PAGE_SIZE);

  return (
    <>
      <ProductTable rows={rows} ctx={ctx} />
      <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>
          {total} {total === 1 ? "product" : "products"}
        </span>
        {pages > 1 ? (
          <span>
            Page {page} of {pages}
          </span>
        ) : null}
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="mb-3 h-10 w-full last:mb-0" />
      ))}
    </div>
  );
}

export default async function InventoryPage({
  searchParams,
}: PageProps<"/inventory">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  // Touch the client so an unconfigured environment fails here with a clear
  // message rather than deep inside a query.
  await createClient();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory"
        description="What you stock, what it's worth, and what's running out."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/inventory/products/import">
                <FileUp />
                Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/products/new">
                <Plus />
                Add product
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ProductSearch initial={search ?? ""} />
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/inventory/categories">Categories</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/inventory/units">Units</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/inventory/adjustments">Adjustments</Link>
          </Button>
        </div>
      </div>

      <Suspense key={`${search}-${page}`} fallback={<TableSkeleton />}>
        <ProductList search={search} page={page} />
      </Suspense>
    </div>
  );
}
