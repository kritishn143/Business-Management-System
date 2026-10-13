/**
 * Shared between the server query and the client filter bar, so neither has to
 * import the other — the queries module reaches for next/headers, which cannot
 * cross into the browser bundle.
 */
export const LEDGER_KINDS = [
  { value: "", label: "Everything" },
  { value: "opening", label: "Opening" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "transfer_in", label: "Moved in" },
  { value: "transfer_out", label: "Moved out" },
  { value: "adjustment", label: "Corrections" },
] as const;

/** Entry kinds that live in account_movements and so can be removed. */
export const REMOVABLE_KINDS = ["adjustment", "transfer_in", "transfer_out"];
