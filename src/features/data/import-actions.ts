"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { previewProductImport, type ProductDraft } from "./import-products";
import { previewPartyImport } from "./import-parties";

export type ImportResult = {
  error?: string;
  imported?: number;
  /** Rows the server rejected even though the browser accepted them. */
  rejected?: { row: number; column: string; message: string }[];
};

/** Names and ids of everything a row can refer to, plus what is already taken. */
export async function loadImportContext() {
  const supabase = await createClient();

  const [units, categories, products] = await Promise.all([
    supabase
      .from("units")
      .select("id, name, symbol, conversion_factor")
      .eq("is_active", true)
      // Base units first, so the fallback unit is the shop's smallest one.
      .order("conversion_factor", { ascending: true }),
    supabase.from("categories").select("id, name").eq("is_active", true),
    supabase.from("products").select("sku, barcode"),
  ]);

  if (units.error || categories.error || products.error) {
    const error = units.error ?? categories.error ?? products.error;
    console.error("[import] context", error?.code, error?.message);
    throw new Error("We couldn't read your units and categories.");
  }

  return {
    units: (units.data ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      symbol: u.symbol as string | null,
      conversionFactor: Number(u.conversion_factor),
    })),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    existingSkus: (products.data ?? [])
      .map((p) => p.sku)
      .filter((s): s is string => Boolean(s)),
    existingBarcodes: (products.data ?? [])
      .map((p) => p.barcode)
      .filter((b): b is string => Boolean(b)),
  };
}

/**
 * Imports the rows the user confirmed. The file is re-validated here against
 * freshly read units, categories and SKUs — the browser's preview is a
 * courtesy, never the authority (SPEC §23, §88).
 */
export async function importProductsAction(
  rows: Record<string, string>[],
): Promise<ImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "There was nothing to import." };
  }
  if (rows.length > 2000) {
    return { error: "That file is too large. Split it into batches of 2,000 rows." };
  }

  const context = await loadImportContext();

  const units = new Map(
    context.units.flatMap((u) => {
      const entries: [string, string][] = [[u.name.toLowerCase(), u.id]];
      if (u.symbol) entries.push([u.symbol.toLowerCase(), u.id]);
      return entries;
    }),
  );
  const categories = new Map(
    context.categories.map((c) => [c.name.toLowerCase(), c.id] as const),
  );

  const defaultUnit = context.units[0];
  if (!defaultUnit) {
    return { error: "Add at least one unit before importing products." };
  }

  const preview = previewProductImport(rows, {
    unitNames: new Set(units.keys()),
    categoryNames: new Set(categories.keys()),
    existingSkus: new Set(context.existingSkus.map((s) => s.toLowerCase())),
    existingBarcodes: new Set(context.existingBarcodes.map((b) => b.toLowerCase())),
    defaultUnitName: defaultUnit.name,
  });

  if (preview.drafts.length === 0) {
    return {
      error: "None of those rows could be imported.",
      rejected: preview.issues.slice(0, 50),
    };
  }

  const supabase = await createClient();

  // business_id comes from a unit the user can already see, never from input.
  const { data: unitRow, error: unitError } = await supabase
    .from("units")
    .select("business_id")
    .eq("id", defaultUnit.id)
    .single();

  if (unitError || !unitRow) {
    return { error: "We couldn't work out which shop to import into." };
  }

  const businessId = unitRow.business_id;

  const rowsToInsert = preview.drafts.map((draft: ProductDraft) => ({
    business_id: businessId,
    name: draft.name,
    sku: draft.sku,
    barcode: draft.barcode,
    base_unit_id: units.get(draft.unitName.toLowerCase()) ?? defaultUnit.id,
    category_id: draft.categoryName
      ? (categories.get(draft.categoryName.toLowerCase()) ?? null)
      : null,
    purchase_price: draft.purchasePrice,
    selling_price: draft.sellingPrice,
    minimum_stock: draft.minimumStock,
    track_inventory: true,
  }));

  const { data: inserted, error } = await supabase
    .from("products")
    .insert(rowsToInsert)
    .select("id, name");

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to add products." };
    }
    if (error.code === "23505") {
      return {
        error:
          "One of those products clashes with an existing SKU or barcode. Nothing was imported.",
      };
    }
    console.error("[import] insert", error.code, error.message);
    return { error: "We couldn't import that file. Nothing was saved." };
  }

  // Opening stock is a ledger entry, never a column write (SPEC §11). A failure
  // here leaves the products in place, so it is reported rather than hidden.
  const byName = new Map((inserted ?? []).map((p) => [p.name, p.id] as const));
  const stockFailures: ImportResult["rejected"] = [];

  for (const [index, draft] of preview.drafts.entries()) {
    if (draft.openingStock <= 0) continue;
    const id = byName.get(draft.name);
    if (!id) continue;

    const { error: stockError } = await supabase.rpc("adjust_stock", {
      p_product_id: id,
      p_quantity: draft.openingStock,
      p_reason: "opening_stock",
      p_unit_cost: draft.purchasePrice > 0 ? draft.purchasePrice : null,
      p_notes: "Opening stock from an imported file",
    });

    if (stockError) {
      console.error("[import] opening stock", stockError.code, stockError.message);
      stockFailures.push({
        row: index + 2,
        column: "opening stock",
        message: `${draft.name} was imported, but its opening stock was not recorded.`,
      });
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/products");

  return {
    imported: inserted?.length ?? 0,
    rejected: [...preview.issues, ...stockFailures].slice(0, 50),
  };
}

/** Names already taken, so a duplicate contact is caught before insert. */
export async function loadPartyImportContext(kind: "customer" | "supplier") {
  const supabase = await createClient();

  const { data, error } = await supabase.from("parties").select("name");

  if (error) {
    console.error("[import] parties context", error.code, error.message);
    throw new Error("We couldn't read your contacts.");
  }

  return {
    kind,
    existingNames: (data ?? []).map((p) => p.name),
  };
}

/**
 * Imports contacts. Re-validated here against freshly read names, for the same
 * reason products are: the browser's preview is a courtesy (SPEC §23, §88).
 */
export async function importPartiesAction(
  kind: "customer" | "supplier",
  rows: Record<string, string>[],
): Promise<ImportResult> {
  if (kind !== "customer" && kind !== "supplier") {
    return { error: "We couldn't work out what kind of contact to import." };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "There was nothing to import." };
  }
  if (rows.length > 2000) {
    return { error: "That file is too large. Split it into batches of 2,000 rows." };
  }

  const supabase = await createClient();

  const [{ data: existing, error: readError }, units] = await Promise.all([
    supabase.from("parties").select("name"),
    // A unit is the cheapest row that carries the business id RLS lets us see.
    supabase.from("units").select("business_id").limit(1).single(),
  ]);

  if (readError || units.error || !units.data) {
    console.error("[import] parties", readError?.code ?? units.error?.code);
    return { error: "We couldn't work out which shop to import into." };
  }

  const preview = previewPartyImport(rows, {
    existingNames: new Set((existing ?? []).map((p) => p.name.toLowerCase())),
  });

  if (preview.drafts.length === 0) {
    return {
      error: "None of those contacts could be imported.",
      rejected: preview.issues.slice(0, 50),
    };
  }

  const { data: inserted, error } = await supabase
    .from("parties")
    .insert(
      preview.drafts.map((draft) => ({
        business_id: units.data.business_id,
        type: kind,
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
        address: draft.address,
        opening_balance: draft.openingBalance,
        credit_limit: draft.creditLimit,
        notes: draft.notes,
      })),
    )
    .select("id");

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to add contacts." };
    }
    console.error("[import] parties insert", error.code, error.message);
    return { error: "We couldn't import that file. Nothing was saved." };
  }

  revalidatePath(kind === "customer" ? "/customers" : "/suppliers");

  return {
    imported: inserted?.length ?? 0,
    rejected: preview.issues.slice(0, 50),
  };
}
