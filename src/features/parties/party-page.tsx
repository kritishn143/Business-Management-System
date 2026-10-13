import Link from "next/link";
import { FileUp, Users } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatMoney } from "@/lib/format";
import { AddPartyDialog } from "./party-forms";
import { PartyList } from "./party-list";
import { listParties, type PartyKind } from "./queries";

const COPY = {
  customer: {
    title: "Customers",
    description: "Who buys from you, and who owes you money.",
    emptyTitle: "No customers yet",
    emptyBody:
      "Add the people who buy on credit, so you can track what's owed and print a statement. Walk-in cash sales don't need a record.",
    totalLabel: "Owed to you",
  },
  supplier: {
    title: "Suppliers",
    description: "Who you buy from, and what you owe them.",
    emptyTitle: "No suppliers yet",
    emptyBody:
      "Add the businesses you buy stock from, so purchases and payments stay tied to the right account.",
    totalLabel: "You owe",
  },
} as const;

export async function PartyPage({ kind }: { kind: PartyKind }) {
  const [rows, memberships] = await Promise.all([listParties(kind), listMemberships()]);

  const ctx = formatContextOf(memberships[0].business);

  const copy = COPY[kind];

  // Only balances pointing the "wrong" way are worth totalling.
  const outstanding = rows.reduce((total, p) => {
    if (kind === "customer") return p.balance > 0 ? total + p.balance : total;
    return p.balance < 0 ? total + Math.abs(p.balance) : total;
  }, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/${kind === "customer" ? "customers" : "suppliers"}/import`}>
                <FileUp />
                Import
              </Link>
            </Button>
            <AddPartyDialog kind={kind} />
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <>
          <div className="mb-5 inline-flex items-baseline gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3">
            <span className="text-[13px] text-ink-muted">{copy.totalLabel}</span>
            <span className="tabular text-lg font-semibold text-ink">
              {formatMoney(outstanding, ctx)}
            </span>
            <span className="text-xs text-ink-subtle">
              across {rows.length} {rows.length === 1 ? "contact" : "contacts"}
            </span>
          </div>

          <PartyList rows={rows} kind={kind} ctx={ctx} />
        </>
      )}
    </div>
  );
}
