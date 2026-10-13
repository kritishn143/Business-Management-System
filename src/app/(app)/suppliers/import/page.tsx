import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { loadPartyImportContext } from "@/features/data/import-actions";
import { ImportPartiesForm } from "@/features/data/import-parties-form";

export const metadata: Metadata = { title: "Import suppliers" };

export default async function ImportSuppliersPage() {
  const context = await loadPartyImportContext("supplier");

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Suppliers
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Import suppliers"
          description="Bring your contact list in from a spreadsheet. Nothing is saved until you have seen what will be created."
        />
      </div>

      <ImportPartiesForm kind="supplier" existingNames={context.existingNames} />
    </div>
  );
}
