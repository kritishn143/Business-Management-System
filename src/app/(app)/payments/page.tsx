import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { listPartyChoices, listPayments } from "@/features/payments/queries";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import { MoneyNav } from "@/features/money/money-nav";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const [payments, parties, { business }] = await Promise.all([
    listPayments(),
    listPartyChoices(),
    loadActiveBusiness(),
  ]);

  const ctx = formatContextOf(business);

  return (
    <div className="mx-auto max-w-4xl">
      <MoneyNav current="payments" />

      <div className="mt-6" />
      <PageHeader
        title="Payments"
        description="Money settled against a customer's or supplier's account, rather than at the counter."
        actions={<RecordPaymentDialog parties={parties} />}
      />

      {payments.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No payments yet"
          description="When a customer settles an old invoice, or you pay a supplier's bill, record it here so their balance stays right."
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Note</Th>
                <Th>Direction</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatDateTime(p.createdAt, ctx)}
                  </Td>
                  <Td>
                    {p.party ? (
                      <Link
                        href={`${p.party.type === "supplier" ? "/suppliers" : "/customers"}/${p.party.id}`}
                        className="font-medium text-ink hover:text-accent hover:underline"
                      >
                        {p.party.name}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </Td>
                  <Td className="text-ink-muted">{p.description ?? "—"}</Td>
                  <Td>
                    {p.direction === "in" ? (
                      <Badge tone="positive">Received</Badge>
                    ) : (
                      <Badge tone="caution">Paid out</Badge>
                    )}
                  </Td>
                  <Td className="tabular text-right font-medium">
                    {formatMoney(p.amount, ctx)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <p className="mt-4 text-[13px] text-ink-subtle">
        Each payment is a ledger entry, so a balance is always the sum of what
        was actually recorded — never a figure written over the top.
      </p>
    </div>
  );
}
