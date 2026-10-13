import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { PendingSales } from "@/features/sales/pending-sales";

export const metadata: Metadata = { title: "Waiting to sync" };

export default async function PendingSalesPage() {
  const { business } = await loadActiveBusiness();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/sales"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Sales
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Waiting to sync"
          description="Sales recorded on this device that have not reached the server yet. They live here, not in your books, until they do."
        />
      </div>

      <PendingSales ctx={formatContextOf(business)} />
    </div>
  );
}
