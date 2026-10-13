import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { formatDateTime, formatMoney, formatQuantity, type FormatContext } from "@/lib/format";
import type { MovementRow } from "./queries";

const MOVEMENT_LABEL: Record<string, string> = {
  opening: "Opening stock",
  purchase: "Purchase",
  purchase_return: "Returned to supplier",
  sale: "Sale",
  sale_return: "Customer return",
  adjustment: "Adjustment",
  damage: "Damaged",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
};

const REASON_LABEL: Record<string, string> = {
  opening_stock: "Opening stock",
  physical_count: "Physical count",
  damaged: "Damaged",
  lost: "Lost",
  expired: "Expired",
  found: "Found",
  correction: "Correction",
  transfer: "Transfer",
  other: "Other",
};

export function MovementTimeline({
  movements,
  unitSymbol,
  ctx,
}: {
  movements: MovementRow[];
  unitSymbol: string;
  ctx: FormatContext;
}) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>What happened</Th>
            <Th className="text-right">Change</Th>
            <Th className="text-right">Unit cost</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const qty = Number(m.quantity);
            const inbound = qty > 0;
            const Icon = inbound ? ArrowUpRight : ArrowDownRight;

            return (
              <Tr key={m.id}>
                <Td className="whitespace-nowrap text-ink-muted">
                  {formatDateTime(m.created_at, ctx)}
                </Td>
                <Td>
                  {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                  {m.reason && m.reason !== m.movement_type ? (
                    <span className="ml-1.5 text-xs text-ink-subtle">
                      {REASON_LABEL[m.reason] ?? m.reason}
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular whitespace-nowrap text-right">
                  <span
                    className={
                      inbound
                        ? "inline-flex items-center gap-1 text-positive"
                        : "inline-flex items-center gap-1 text-critical"
                    }
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {inbound ? "+" : "−"}
                    {formatQuantity(Math.abs(qty), ctx.number_format)}
                    <span className="text-xs text-ink-subtle">{unitSymbol}</span>
                  </span>
                </Td>
                <Td className="tabular text-right text-ink-muted">
                  {m.unit_cost ? formatMoney(m.unit_cost, ctx) : "—"}
                </Td>
                <Td className="text-ink-muted">{m.notes ?? "—"}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
