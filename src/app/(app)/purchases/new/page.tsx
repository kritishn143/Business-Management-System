import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { listSuppliers } from "@/features/purchases/actions";
import { PurchaseEntry } from "@/features/purchases/purchase-entry";

export const metadata: Metadata = { title: "Record a purchase" };

export default async function NewPurchasePage() {
  const [memberships, suppliers] = await Promise.all([
    listMemberships(),
    listSuppliers(),
  ]);

  const ctx = formatContextOf(memberships[0].business);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/purchases"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Purchases
      </Link>

      <h1 className="mt-4 mb-6 text-[28px] font-semibold tracking-tight text-ink">
        Record a purchase
      </h1>

      <PurchaseEntry ctx={ctx} suppliers={suppliers} />
    </div>
  );
}
