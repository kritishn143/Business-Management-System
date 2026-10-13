import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScrollText } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { balanceLabel } from "./party-list";
import { RecordPaymentDialog } from "./party-forms";
import { getParty, listLedger, type PartyKind } from "./queries";

const ENTRY_LABEL: Record<string, string> = {
  opening: "Opening balance",
  sale: "Sale on credit",
  sale_return: "Sale returned",
  purchase: "Purchase on credit",
  purchase_return: "Purchase returned",
  payment_in: "Payment received",
  payment_out: "Payment made",
  adjustment: "Adjustment",
};

export async function PartyDetail({
  id,
  kind,
}: {
  id: string;
  kind: PartyKind;
}) {
  const party = await getParty(id);
  if (!party) notFound();

  const [ledger, memberships] = await Promise.all([listLedger(id), listMemberships()]);

  const ctx = formatContextOf(memberships[0].business);

  const label = balanceLabel(party.balance, kind);
  const backHref = kind === "customer" ? "/customers" : "/suppliers";

  // `ledger` arrives newest-first, but a running balance only makes sense
  // accumulated oldest-first. Walk it backwards into a lookup, then render in
  // the original order — no array is reversed or mutated.
  const runningById = new Map<string, number>();
  let running = Number(party.opening_balance);
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    const e = ledger[i];
    running += Number(e.debit) - Number(e.credit);
    runningById.set(e.id, running);
  }
  const withRunning = ledger.map((e) => ({
    ...e,
    running: runningById.get(e.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink print:hidden"
      >
        <ArrowLeft className="size-4" />
        {kind === "customer" ? "Customers" : "Suppliers"}
      </Link>

      <div className="mt-4 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            {party.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            {party.phone ? <span>{party.phone}</span> : null}
            {party.email ? <span>· {party.email}</span> : null}
            {party.address ? <span>· {party.address}</span> : null}
          </div>
        </div>

        <div className="print:hidden">
          <RecordPaymentDialog partyId={party.id} partyName={party.name} kind={kind} />
        </div>
      </div>

      <div className="mb-8 flex flex-wrap items-baseline gap-3 rounded-xl border border-line bg-surface-raised px-5 py-4">
        <Badge tone={label.tone}>{label.text}</Badge>
        <span className="tabular text-2xl font-semibold text-ink">
          {formatMoney(Math.abs(party.balance), ctx)}
        </span>
        {party.credit_limit ? (
          <span className="text-[13px] text-ink-subtle">
            Credit limit {formatMoney(party.credit_limit, ctx)}
          </span>
        ) : null}
      </div>

      <h2 className="mb-4 text-base font-semibold text-ink">Statement</h2>

      {withRunning.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nothing on this statement yet"
          description="Credit sales, purchases and payments will appear here, each one permanent."
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What</Th>
                <Th className="text-right">Charged</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {withRunning.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatDateTime(e.created_at, ctx)}
                  </Td>
                  <Td>
                    {ENTRY_LABEL[e.entry_type] ?? e.entry_type}
                    {e.description ? (
                      <span className="ml-1.5 text-xs text-ink-subtle">
                        {e.description}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right">
                    {Number(e.debit) > 0 ? formatMoney(e.debit, ctx) : "—"}
                  </Td>
                  <Td className="tabular text-right">
                    {Number(e.credit) > 0 ? formatMoney(e.credit, ctx) : "—"}
                  </Td>
                  <Td className="tabular text-right font-medium">
                    {formatMoney(Math.abs(e.running), ctx)}
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
