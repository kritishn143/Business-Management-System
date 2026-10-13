/**
 * Turning a shopkeeper's spreadsheet into products (SPEC §23).
 *
 * Pure and synchronous on purpose: the same function checks the file in the
 * browser for the preview and again on the server before anything is written,
 * so the preview can never disagree with what actually happens.
 */

export type ProductDraft = {
  name: string;
  sku: string | null;
  barcode: string | null;
  unitName: string;
  categoryName: string | null;
  purchasePrice: number;
  sellingPrice: number;
  minimumStock: number;
  openingStock: number;
};

export type RowIssue = { row: number; column: string; message: string };

export type ImportPreview = {
  /** Rows that would be created, in file order. */
  drafts: ProductDraft[];
  /** Everything wrong, keyed to the row number as the user sees it. */
  issues: RowIssue[];
  /** Header names we could not place, so the user can fix their file. */
  unknownColumns: string[];
  /** Whether a usable "name" column was found at all. */
  hasNameColumn: boolean;
};

/**
 * Header aliases, because nobody's spreadsheet is named the way ours is. The
 * first entry of each list is the canonical field.
 */
const COLUMN_ALIASES: Record<keyof ProductDraft | "ignore", string[]> = {
  name: ["name", "product", "product name", "item", "item name", "description"],
  sku: ["sku", "code", "item code", "product code", "article"],
  barcode: ["barcode", "ean", "upc", "bar code"],
  unitName: ["unit", "uom", "unit of measure", "units"],
  categoryName: ["category", "group", "type"],
  purchasePrice: ["purchase price", "cost", "cost price", "buy price", "purchase"],
  sellingPrice: ["selling price", "price", "sale price", "sell price", "mrp"],
  minimumStock: ["minimum stock", "min stock", "reorder level", "minimum"],
  openingStock: ["opening stock", "stock", "quantity", "qty", "on hand", "opening"],
  ignore: [],
};

export type ColumnMap = Partial<Record<keyof ProductDraft, string>>;

/** Works out which header holds which field. */
export function detectColumns(headers: string[]): {
  map: ColumnMap;
  unknown: string[];
} {
  const map: ColumnMap = {};
  const unknown: string[] = [];

  for (const header of headers) {
    const normalised = header.trim().toLowerCase();
    if (normalised === "") continue;

    let placed = false;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (field === "ignore") continue;
      const key = field as keyof ProductDraft;
      // First column wins, so a file with both "price" and "selling price"
      // keeps whichever came first rather than silently swapping them.
      if (aliases.includes(normalised) && map[key] === undefined) {
        map[key] = header;
        placed = true;
        break;
      }
    }

    if (!placed) unknown.push(header);
  }

  return { map, unknown };
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export type ImportContext = {
  /** Unit names available in the shop, lower-cased, with their symbols too. */
  unitNames: Set<string>;
  categoryNames: Set<string>;
  /** SKUs already used, lower-cased, so a clash is caught before insert. */
  existingSkus: Set<string>;
  existingBarcodes: Set<string>;
  /** Unit to fall back on when the file has no unit column. */
  defaultUnitName: string;
};

/**
 * Validates every row and returns both what would be created and what is
 * wrong. A row with any issue is not included in the drafts, so importing what
 * passed never half-writes a bad row.
 */
export function previewProductImport(
  rows: Record<string, string>[],
  context: ImportContext,
): ImportPreview {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const { map, unknown } = detectColumns(headers);

  const drafts: ProductDraft[] = [];
  const issues: RowIssue[] = [];

  // Clashes within the file itself matter as much as clashes with the database.
  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  const seenNames = new Set<string>();

  rows.forEach((row, index) => {
    // Row 1 is the header, so the first data row is row 2 to the user.
    const rowNumber = index + 2;
    const cell = (field: keyof ProductDraft): string => {
      const header = map[field];
      return header === undefined ? "" : (row[header] ?? "").trim();
    };

    const name = cell("name");

    // A blank line in the middle of a spreadsheet is not an error.
    if (Object.values(row).every((v) => v.trim() === "")) return;

    let rowFailed = false;
    const fail = (column: string, message: string) => {
      issues.push({ row: rowNumber, column, message });
      rowFailed = true;
    };

    if (name === "") fail("name", "Every product needs a name.");
    if (name.length > 160) fail("name", "That name is too long.");

    const lowerName = name.toLowerCase();
    if (name !== "" && seenNames.has(lowerName)) {
      fail("name", "This name appears more than once in the file.");
    }

    const sku = cell("sku") || null;
    if (sku) {
      const key = sku.toLowerCase();
      if (context.existingSkus.has(key)) {
        fail("sku", "A product in your catalogue already uses this SKU.");
      } else if (seenSkus.has(key)) {
        fail("sku", "This SKU appears more than once in the file.");
      }
    }

    const barcode = cell("barcode") || null;
    if (barcode) {
      const key = barcode.toLowerCase();
      if (context.existingBarcodes.has(key)) {
        fail("barcode", "A product in your catalogue already uses this barcode.");
      } else if (seenBarcodes.has(key)) {
        fail("barcode", "This barcode appears more than once in the file.");
      }
    }

    const unitName = cell("unitName") || context.defaultUnitName;
    if (!context.unitNames.has(unitName.toLowerCase())) {
      fail("unit", `"${unitName}" is not one of your units. Add it first, or correct the file.`);
    }

    const categoryName = cell("categoryName") || null;
    if (categoryName && !context.categoryNames.has(categoryName.toLowerCase())) {
      fail("category", `"${categoryName}" is not one of your categories. Add it first, or leave the cell empty.`);
    }

    const purchasePrice = parseAmount(cell("purchasePrice"));
    if (purchasePrice === null) {
      fail("purchase price", "Enter an amount like 25 or 25.50.");
    }

    const sellingPrice = parseAmount(cell("sellingPrice"));
    if (sellingPrice === null) {
      fail("selling price", "Enter an amount like 25 or 25.50.");
    }

    const minimumStock = parseAmount(cell("minimumStock"));
    if (minimumStock === null) fail("minimum stock", "Enter a whole number, like 10.");

    const openingStock = parseAmount(cell("openingStock"));
    if (openingStock === null) fail("opening stock", "Enter a number, like 10.");

    if (rowFailed) return;

    if (name !== "") seenNames.add(lowerName);
    if (sku) seenSkus.add(sku.toLowerCase());
    if (barcode) seenBarcodes.add(barcode.toLowerCase());

    drafts.push({
      name,
      sku,
      barcode,
      unitName,
      categoryName,
      purchasePrice: purchasePrice ?? 0,
      sellingPrice: sellingPrice ?? 0,
      minimumStock: minimumStock ?? 0,
      openingStock: openingStock ?? 0,
    });
  });

  return {
    drafts,
    issues,
    unknownColumns: unknown,
    hasNameColumn: map.name !== undefined,
  };
}
