import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FolderTree } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { CategoryForm } from "@/features/catalog/category-manager";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active, products:products(count)")
    .order("name");

  if (error) {
    console.error("[categories] list", error.code, error.message);
    throw new Error("We couldn't load your categories.");
  }

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Categories"
          description="Group products so reports and the counter stay easy to scan."
        />
      </div>

      <div className="mb-8 rounded-xl border border-line bg-surface-raised p-5">
        <CategoryForm />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Categories are optional, but they make reports far more useful. Try Writing, Paper, or Files."
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Products</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="tabular text-right text-ink-muted">
                    {(c.products as unknown as { count: number }[])?.[0]?.count ?? 0}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
