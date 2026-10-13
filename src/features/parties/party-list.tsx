import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatMoney, type FormatContext } from "@/lib/format";
import type { PartyKind, PartyRow } from "./queries";

/**
 * A single signed balance is not a useful thing to show a shopkeeper, so it is
 * translated here into the two questions they actually ask: who owes me, and
 * whom do I owe.
 */
export function balanceLabel(balance: number, kind: PartyKind) {
  if (balance === 0) return { text: "Settled", tone: "neutral" as const };
  if (kind === "customer") {
    return balance > 0
      ? { text: "Owes you", tone: "caution" as const }
      : { text: "In credit", tone: "positive" as const };
  }
  return balance < 0
    ? { text: "You owe", tone: "caution" as const }
    : { text: "In credit", tone: "positive" as const };
}

export function PartyList({
  rows,
  kind,
  ctx,
}: {
  rows: PartyRow[];
  kind: PartyKind;
  ctx: FormatContext;
}) {
  const href = kind === "customer" ? "/customers" : "/suppliers";

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th className="text-right">Balance</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const label = balanceLabel(p.balance, kind);
            return (
              <Tr key={p.id}>
                <Td>
                  <Link
                    href={`${href}/${p.id}`}
                    className="font-medium text-ink hover:text-accent hover:underline"
                  >
                    {p.name}
                  </Link>
                </Td>
                <Td className="text-ink-muted">{p.phone ?? "—"}</Td>
                <Td className="tabular text-right">
                  {formatMoney(Math.abs(p.balance), ctx)}
                </Td>
                <Td>
                  <Badge tone={label.tone}>{label.text}</Badge>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
