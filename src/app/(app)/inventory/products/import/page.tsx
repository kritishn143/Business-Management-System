import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { loadImportContext } from "@/features/data/import-actions";
import { ImportProductsForm } from "@/features/data/import-products-form";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  const context = await loadImportContext();

  const defaultUnit = context.units[0];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Import products"
          description="Bring your catalogue in from a spreadsheet. Nothing is saved until you have seen what will be created."
        />
      </div>

      {defaultUnit ? (
        <ImportProductsForm
          options={{
            // Symbols count as unit names, so "pc" works as well as "Piece".
            unitNames: context.units.flatMap((u) => (u.symbol ? [u.name, u.symbol] : [u.name])),
            categoryNames: context.categories.map((c) => c.name),
            existingSkus: context.existingSkus,
            existingBarcodes: context.existingBarcodes,
            defaultUnitName: defaultUnit.name,
          }}
        />
      ) : (
        <p className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-ink-muted">
          Add at least one unit before importing products.{" "}
          <Link href="/inventory/units" className="text-accent hover:underline">
            Set up units
          </Link>
          .
        </p>
      )}
    </div>
  );
}
