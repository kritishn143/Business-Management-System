import Link from "next/link";
import { Undo2 } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const COPY = {
  sale: {
    title: "Sales returns",
    description: "Goods customers brought back, and what it cost you.",
    who: "Customer",
    parent: "Invoice",
    parentHref: "/sales",
    back: { href: "/sales", label: "Sales" },
    refund: "Refunded",
    emptyTitle: "No sales returns yet",
    emptyBody:
      "When a customer brings something back, start the return from that invoice so stock and their balance both follow.",
  },
  purchase: {
    title: "Purchase returns",
    description: "Goods you sent back to a supplier, and what it recovered.",
    who: "Supplier",
    parent: "Bill",
    parentHref: "/purchases",
    back: { href: "/purchases", label: "Purchases" },
    refund: "Recovered",
    emptyTitle: "No purchase returns yet",
    emptyBody:
      "When you send stock back to a supplier, start the return from that bill so stock and what you owe both follow.",
  },
} as const;

/**
 * Returns are their own transactions linked to the original, never an edit of
 * it (SPEC §9, §14), so they are worth a list of their own.
 */
export async function ReturnsPage({ kind }: { kind: "sale" | "purchase" }) {
  const copy = COPY[kind];
  const supabase = await createClient();

  // The embed hints are the constraint names, which differ per side.
  const table = kind === "sale" ? "sale_returns" : "purchase_returns";
  const parentTable = kind === "sale" ? "sales" : "purchases";
  const parentConstraint =
    kind === "sale"
      ? "sale_returns_sale_same_business"
      : "purchase_returns_purchase_same_business";
  const partyConstraint =
    kind === "sale"
      ? "sale_returns_customer_same_business"
      : "purchase_returns_supplier_same_business";

  const [{ data, error }, { business }] = await Promise.all([
    supabase
      .from(table)
      .select(
        `id, return_number, return_date, total_amount, refunded_amount, reason, status,
         parent:${parentTable}!${parentConstraint} (id, invoice_number),
         party:parties!${partyConstraint} (id, name, type)`,
      )
      .order("return_date", { ascending: false })
      .limit(100),
    loadActiveBusiness(),
  ]);

  const ctx = formatContextOf(business);

  if (error) {
    console.error(`[returns] ${kind}`, error.code, error.message);
    throw new Error("We couldn't load your returns.");
  }

  type Row = {
    id: string;
    return_number: string;
    return_date: string;
    total_amount: string;
    refunded_amount: string;
    reason: string | null;
    parent: { id: string; invoice_number: string | null } | null;
    party: { id: string; name: string; type: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const total = rows.reduce((t, r) => t + Number(r.total_amount), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={copy.back.href}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        {copy.back.label}
      </Link>

      <div className="mt-4">
        <PageHeader title={copy.title} description={copy.description} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Undo2} title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Return</Th>
                  <Th>When</Th>
                  <Th>{copy.parent}</Th>
                  <Th>{copy.who}</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Value</Th>
                  <Th className="text-right">{copy.refund}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.return_number}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(r.return_date, ctx)}
                    </Td>
                    <Td>
                      {r.parent ? (
                        <Link
                          href={`${copy.parentHref}/${r.parent.id}`}
                          className="text-ink hover:text-accent hover:underline"
                        >
                          {r.parent.invoice_number ?? "View"}
                        </Link>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </Td>
                    <Td className="text-ink-muted">
                      {r.party ? r.party.name : kind === "sale" ? "Walk-in" : "—"}
                    </Td>
                    <Td className="text-ink-muted">{r.reason ?? "—"}</Td>
                    <Td className="tabular text-right">
                      {formatMoney(r.total_amount, ctx)}
                    </Td>
                    <Td className="tabular text-right text-ink-muted">
                      {formatMoney(r.refunded_amount, ctx)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td className="font-medium" colSpan={5}>
                    {rows.length} {rows.length === 1 ? "return" : "returns"}
                  </Td>
                  <Td className="tabular text-right font-semibold">
                    {formatMoney(String(total.toFixed(2)), ctx)}
                  </Td>
                  <Td />
                </tr>
              </tfoot>
            </Table>
          </TableWrap>

          <p className="mt-4 text-[13px] text-ink-subtle">
            Each return is its own transaction linked to the original, so the
            original record is never rewritten.
          </p>
        </>
      )}
    </div>
  );
}
