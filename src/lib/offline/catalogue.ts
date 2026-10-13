import { CACHE, get, isOfflineCapable, put } from "./db";

/** The shape the POS needs to sell something, and nothing more. */
export type CachedProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitId: string;
  unitSymbol: string | null;
  sellingPrice: string;
  stock: string | null;
};

type Snapshot = { savedAt: number; products: CachedProduct[] };

const KEY = "catalogue";

/**
 * Matches the server's product search closely enough that the counter behaves
 * the same offline: name, SKU or barcode, case-insensitive (SPEC §7, §49).
 *
 * Pure, so the matching itself is tested without a browser.
 */
export function searchCachedProducts(
  products: CachedProduct[],
  term: string,
  limit = 20,
): CachedProduct[] {
  const query = term.trim().toLowerCase();
  if (query === "") return products.slice(0, limit);

  const scored: { product: CachedProduct; rank: number }[] = [];

  for (const product of products) {
    const name = product.name.toLowerCase();
    const sku = product.sku?.toLowerCase() ?? "";
    const barcode = product.barcode?.toLowerCase() ?? "";

    // A scanned barcode should win outright; then codes, then names.
    let rank: number | null = null;
    if (barcode !== "" && barcode === query) rank = 0;
    else if (sku !== "" && sku === query) rank = 1;
    else if (name.startsWith(query)) rank = 2;
    else if (name.includes(query)) rank = 3;
    else if (sku.includes(query)) rank = 4;
    else if (barcode.includes(query)) rank = 5;

    if (rank !== null) scored.push({ product, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name))
    .slice(0, limit)
    .map((s) => s.product);
}

export async function saveCatalogue(products: CachedProduct[]): Promise<void> {
  if (!isOfflineCapable()) return;
  try {
    await put<Snapshot>(CACHE, { savedAt: Date.now(), products }, KEY);
  } catch {
    // Caching is an optimisation; failing to cache must not fail the page.
  }
}

export async function loadCatalogue(): Promise<Snapshot | null> {
  if (!isOfflineCapable()) return null;
  try {
    return (await get<Snapshot>(CACHE, KEY)) ?? null;
  } catch {
    return null;
  }
}
