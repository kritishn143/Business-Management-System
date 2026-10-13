import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/features/products/product-form";
import { loadProductFormOptions } from "@/features/products/queries";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const options = await loadProductFormOptions();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <h1 className="mt-4 mb-8 text-[28px] font-semibold tracking-tight text-ink">
        Add a product
      </h1>

      <ProductForm options={options} />
    </div>
  );
}
