/**
 * Shapes shared by the server queries and the client forms. Kept apart from
 * queries.ts, which reaches for next/headers and so cannot be imported — even
 * for a type — from anything that runs in the browser.
 */
export type MoneyKind = "expense" | "income";

export type MoneyEntry = {
  id: string;
  amount: string;
  entry_date: string;
  description: string | null;
  /** Ids as well as names, so an edit form can be prefilled. */
  categoryId: string | null;
  accountId: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
};

export type MoneyOptions = {
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string; is_default: boolean }[];
};
