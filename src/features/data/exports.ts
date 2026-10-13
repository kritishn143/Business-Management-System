import { createClient } from "@/lib/supabase/server";
import { toCsv, type CsvColumn } from "@/lib/csv";

/**
 * Everything a shop can take away with it (SPEC §76). Each export is a plain
 * select through RLS, so a user can only ever export their own business.
 */
export const EXPORTS = {
  products: {
    label: "Products",
    description: "Your catalogue, with prices and current stock.",
  },
  customers: { label: "Customers", description: "Contacts and opening balances." },
  suppliers: { label: "Suppliers", description: "Contacts and opening balances." },
  sales: { label: "Sales", description: "Every invoice, with totals and what is owed." },
  "sale-items": { label: "Sale lines", description: "Each line of each invoice." },
  purchases: { label: "Purchases", description: "Every bill, with totals and what is owed." },
  payments: { label: "Payments", description: "Money settled against an account." },
  expenses: { label: "Expenses", description: "What the shop spent, by category." },
  income: { label: "Other income", description: "Money in that was not a sale." },
  "stock-movements": {
    label: "Stock movements",
    description: "The full inventory ledger — every in and out.",
  },
} as const;

export type ExportKey = keyof typeof EXPORTS;

export function isExportKey(value: string): value is ExportKey {
  return value in EXPORTS;
}

type Loader = () => Promise<{ csv: string }>;

/** A row shape loose enough for the export queries, which are read-only. */
type Row = Record<string, unknown>;

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/** Reads a joined single row that PostgREST returns as an object or an array. */
function joined(value: unknown, key: string): string {
  if (Array.isArray(value)) return text((value[0] as Row | undefined)?.[key]);
  if (value && typeof value === "object") return text((value as Row)[key]);
  return "";
}

function columns(spec: [string, (row: Row) => unknown][]): CsvColumn<Row>[] {
  return spec.map(([header, value]) => ({ header, value: (row) => text(value(row)) }));
}

export async function loadExport(key: ExportKey): Promise<string> {
  const supabase = await createClient();

  async function query(
    table: string,
    select: string,
    order: { column: string; ascending?: boolean },
  ): Promise<Row[]> {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(order.column, { ascending: order.ascending ?? true });

    if (error) {
      console.error("[export]", table, error.code, error.message);
      throw new Error("We couldn't build that export.");
    }
    return (data ?? []) as unknown as Row[];
  }

  const loaders: Record<ExportKey, Loader> = {
    products: async () => {
      const rows = await query(
        "products",
        "name, sku, barcode, brand, purchase_price, selling_price, wholesale_price, mrp, minimum_stock, is_active, categories!products_category_same_business (name), units!products_base_unit_same_business (name), balances:inventory_balances (quantity, average_cost, stock_value)",
        { column: "name" },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Name", (r) => r.name],
            ["SKU", (r) => r.sku],
            ["Barcode", (r) => r.barcode],
            ["Brand", (r) => r.brand],
            ["Category", (r) => joined(r.categories, "name")],
            ["Unit", (r) => joined(r.units, "name")],
            ["Purchase price", (r) => r.purchase_price],
            ["Selling price", (r) => r.selling_price],
            ["Wholesale price", (r) => r.wholesale_price],
            ["MRP", (r) => r.mrp],
            ["Minimum stock", (r) => r.minimum_stock],
            ["Stock on hand", (r) => joined(r.balances, "quantity")],
            ["Average cost", (r) => joined(r.balances, "average_cost")],
            ["Stock value", (r) => joined(r.balances, "stock_value")],
            ["Active", (r) => (r.is_active ? "yes" : "no")],
          ]),
        ),
      };
    },

    customers: async () => ({ csv: await partiesCsv(["customer", "both"]) }),
    suppliers: async () => ({ csv: await partiesCsv(["supplier", "both"]) }),

    sales: async () => {
      const rows = await query(
        "sales",
        "invoice_number, status, sale_date, subtotal, discount_amount, total_amount, paid_amount, due_amount, notes, customer:parties!sales_customer_same_business (name)",
        { column: "sale_date", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Invoice", (r) => r.invoice_number],
            ["Date", (r) => r.sale_date],
            ["Customer", (r) => joined(r.customer, "name") || "Walk-in"],
            ["Status", (r) => r.status],
            ["Subtotal", (r) => r.subtotal],
            ["Discount", (r) => r.discount_amount],
            ["Total", (r) => r.total_amount],
            ["Paid", (r) => r.paid_amount],
            ["Owing", (r) => r.due_amount],
            ["Notes", (r) => r.notes],
          ]),
        ),
      };
    },

    "sale-items": async () => {
      const rows = await query(
        "sale_items",
        "quantity, unit_price, discount_amount, cost_price, line_total, sales!sale_items_sale_same_business (invoice_number, sale_date), products!sale_items_product_same_business (name, sku), units!sale_items_unit_same_business (symbol)",
        { column: "created_at", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Invoice", (r) => joined(r.sales, "invoice_number")],
            ["Date", (r) => joined(r.sales, "sale_date")],
            ["Product", (r) => joined(r.products, "name")],
            ["SKU", (r) => joined(r.products, "sku")],
            ["Quantity", (r) => r.quantity],
            ["Unit", (r) => joined(r.units, "symbol")],
            ["Unit price", (r) => r.unit_price],
            ["Discount", (r) => r.discount_amount],
            ["Cost at sale", (r) => r.cost_price],
            ["Line total", (r) => r.line_total],
          ]),
        ),
      };
    },

    purchases: async () => {
      const rows = await query(
        "purchases",
        "invoice_number, status, purchase_date, subtotal, discount_amount, total_amount, paid_amount, due_amount, notes, supplier:parties!purchases_supplier_same_business (name)",
        { column: "purchase_date", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Bill", (r) => r.invoice_number],
            ["Date", (r) => r.purchase_date],
            ["Supplier", (r) => joined(r.supplier, "name")],
            ["Status", (r) => r.status],
            ["Subtotal", (r) => r.subtotal],
            ["Discount", (r) => r.discount_amount],
            ["Total", (r) => r.total_amount],
            ["Paid", (r) => r.paid_amount],
            ["Owing", (r) => r.due_amount],
            ["Notes", (r) => r.notes],
          ]),
        ),
      };
    },

    payments: async () => {
      const rows = await query(
        "party_ledger_entries",
        "entry_type, debit, credit, description, created_at, parties!party_ledger_party_same_business (name, type)",
        { column: "created_at", ascending: false },
      );
      return {
        csv: toCsv(
          rows.filter((r) => r.entry_type === "payment_in" || r.entry_type === "payment_out"),
          columns([
            ["When", (r) => r.created_at],
            ["Who", (r) => joined(r.parties, "name")],
            ["Direction", (r) => (r.entry_type === "payment_in" ? "received" : "paid out")],
            ["Amount", (r) => (r.entry_type === "payment_in" ? r.credit : r.debit)],
            ["Note", (r) => r.description],
          ]),
        ),
      };
    },

    expenses: async () => {
      const rows = await query(
        "expenses",
        "amount, expense_date, description, expense_categories!expenses_category_same_business (name), accounts!expenses_account_same_business (name)",
        { column: "expense_date", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Date", (r) => r.expense_date],
            ["Category", (r) => joined(r.expense_categories, "name")],
            ["Paid from", (r) => joined(r.accounts, "name")],
            ["Amount", (r) => r.amount],
            ["Description", (r) => r.description],
          ]),
        ),
      };
    },

    income: async () => {
      const rows = await query(
        "income_entries",
        "amount, income_date, description, income_categories!income_entries_category_same_business (name), accounts!income_entries_account_same_business (name)",
        { column: "income_date", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["Date", (r) => r.income_date],
            ["Category", (r) => joined(r.income_categories, "name")],
            ["Paid into", (r) => joined(r.accounts, "name")],
            ["Amount", (r) => r.amount],
            ["Description", (r) => r.description],
          ]),
        ),
      };
    },

    "stock-movements": async () => {
      const rows = await query(
        "stock_movements",
        "movement_type, quantity, unit_cost, reference_type, reason, notes, created_at, products!stock_movements_product_same_business (name, sku)",
        { column: "created_at", ascending: false },
      );
      return {
        csv: toCsv(
          rows,
          columns([
            ["When", (r) => r.created_at],
            ["Product", (r) => joined(r.products, "name")],
            ["SKU", (r) => joined(r.products, "sku")],
            ["Movement", (r) => r.movement_type],
            ["Quantity", (r) => r.quantity],
            ["Unit cost", (r) => r.unit_cost],
            ["Because of", (r) => r.reference_type],
            ["Reason", (r) => r.reason],
            ["Notes", (r) => r.notes],
          ]),
        ),
      };
    },
  };

  async function partiesCsv(types: string[]): Promise<string> {
    const { data, error } = await supabase
      .from("parties")
      .select("name, phone, email, address, opening_balance, credit_limit, notes, type, is_active")
      .in("type", types)
      .order("name");

    if (error) {
      console.error("[export] parties", error.code, error.message);
      throw new Error("We couldn't build that export.");
    }

    return toCsv(
      (data ?? []) as unknown as Row[],
      columns([
        ["Name", (r) => r.name],
        ["Phone", (r) => r.phone],
        ["Email", (r) => r.email],
        ["Address", (r) => r.address],
        ["Opening balance", (r) => r.opening_balance],
        ["Credit limit", (r) => r.credit_limit],
        ["Notes", (r) => r.notes],
        ["Active", (r) => (r.is_active ? "yes" : "no")],
      ]),
    );
  }

  const { csv } = await loaders[key]();
  return csv;
}
