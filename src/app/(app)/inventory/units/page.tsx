import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { UnitForm } from "@/features/catalog/unit-manager";
import { formatQuantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Units" };

type UnitRow = {
  id: string;
  name: string;
  symbol: string;
  conversion_factor: string;
  base_unit_id: string | null;
};

export default async function UnitsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, name, symbol, conversion_factor, base_unit_id")
    .eq("is_active", true)
    .order("conversion_factor");

  if (error) {
    console.error("[units] list", error.code, error.message);
    throw new Error("We couldn't load your units.");
  }

  const rows = (data ?? []) as UnitRow[];
  const byId = new Map(rows.map((u) => [u.id, u]));
  const baseUnits = rows.filter((u) => u.base_unit_id === null);

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
          title="Units"
          description="Stock is always counted in a base unit. Packaging units convert into it, so a box of 12 adds 12 pieces."
        />
      </div>

      <div className="mb-8 rounded-xl border border-line bg-surface-raised p-5">
        <UnitForm baseUnits={baseUnits} />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Unit</Th>
              <Th>Symbol</Th>
              <Th>Converts into</Th>
              <Th className="text-right">How many</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const base = u.base_unit_id ? byId.get(u.base_unit_id) : null;
              return (
                <Tr key={u.id}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-ink-muted">{u.symbol}</Td>
                  <Td className="text-ink-muted">
                    {base ? base.name : "Base unit"}
                  </Td>
                  <Td className="tabular text-right">
                    {base ? formatQuantity(u.conversion_factor) : "—"}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
