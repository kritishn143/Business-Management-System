import { describe, expect, it } from "vitest";
import { parseCsvObjects } from "@/lib/csv";
import { detectColumns, previewProductImport, type ImportContext } from "./import-products";

const context: ImportContext = {
  unitNames: new Set(["piece", "box", "dozen", "pc"]),
  categoryNames: new Set(["writing", "paper"]),
  existingSkus: new Set(["gp-1"]),
  existingBarcodes: new Set(["8901234567890"]),
  defaultUnitName: "Piece",
};

function preview(csv: string) {
  return previewProductImport(parseCsvObjects(csv).rows, context);
}

describe("detectColumns", () => {
  it("recognises our own export's headers", () => {
    const { map } = detectColumns([
      "Name",
      "SKU",
      "Barcode",
      "Category",
      "Unit",
      "Purchase price",
      "Selling price",
      "Minimum stock",
    ]);
    expect(map.name).toBe("Name");
    expect(map.sku).toBe("SKU");
    expect(map.purchasePrice).toBe("Purchase price");
  });

  it("recognises the words a shopkeeper would actually use", () => {
    const { map } = detectColumns(["Item Name", "Code", "Qty", "Cost", "Price"]);
    expect(map.name).toBe("Item Name");
    expect(map.sku).toBe("Code");
    expect(map.openingStock).toBe("Qty");
    expect(map.purchasePrice).toBe("Cost");
    expect(map.sellingPrice).toBe("Price");
  });

  it("reports headers it cannot place instead of ignoring them silently", () => {
    const { map, unknown } = detectColumns(["Name", "Supplier rating", "Colour"]);
    expect(map.name).toBe("Name");
    expect(unknown).toEqual(["Supplier rating", "Colour"]);
  });

  it("keeps the first of two headers that mean the same thing", () => {
    const { map } = detectColumns(["Name", "Price", "Selling price"]);
    expect(map.sellingPrice).toBe("Price");
  });
});

describe("previewProductImport", () => {
  it("accepts a clean file", () => {
    const result = preview(
      "name,sku,unit,category,cost,price,qty\nGel pen,GP-9,Piece,Writing,40,60,25\n",
    );
    expect(result.issues).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      name: "Gel pen",
      sku: "GP-9",
      unitName: "Piece",
      categoryName: "Writing",
      purchasePrice: 40,
      sellingPrice: 60,
      openingStock: 25,
    });
  });

  it("numbers rows the way the spreadsheet does", () => {
    const result = preview("name\nGel pen\n\n");
    expect(result.drafts).toHaveLength(1);

    const bad = preview("name\nGel pen\n\n");
    expect(bad.issues).toEqual([]);

    const missing = preview("name,price\nGel pen,60\n,20\n");
    // The header is row 1, so the offending row is row 3.
    expect(missing.issues[0]).toMatchObject({ row: 3, column: "name" });
  });

  it("skips a blank line without calling it an error", () => {
    const result = preview("name,price\nGel pen,60\n,\nEraser,10\n");
    expect(result.drafts.map((d) => d.name)).toEqual(["Gel pen", "Eraser"]);
    expect(result.issues).toEqual([]);
  });

  it("falls back to the shop's default unit when there is no unit column", () => {
    const result = preview("name,price\nGel pen,60\n");
    expect(result.drafts[0].unitName).toBe("Piece");
  });

  it("refuses a unit the shop does not have", () => {
    const result = preview("name,unit\nGel pen,Gross\n");
    expect(result.drafts).toHaveLength(0);
    expect(result.issues[0].column).toBe("unit");
    expect(result.issues[0].message).toContain("Gross");
  });

  it("refuses a category the shop does not have, but allows an empty one", () => {
    expect(preview("name,category\nGel pen,Toys\n").issues[0].column).toBe("category");
    expect(preview("name,category\nGel pen,\n").issues).toEqual([]);
  });

  it("catches a SKU that is already in the catalogue", () => {
    const result = preview("name,sku\nGel pen,GP-1\n");
    expect(result.issues[0]).toMatchObject({ row: 2, column: "sku" });
    expect(result.drafts).toHaveLength(0);
  });

  it("catches a SKU repeated inside the file", () => {
    const result = preview("name,sku\nGel pen,NEW-1\nBall pen,NEW-1\n");
    expect(result.drafts).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ row: 3, column: "sku" });
  });

  it("matches SKUs and units without caring about case", () => {
    expect(preview("name,sku\nGel pen,gp-1\n").issues[0].column).toBe("sku");
    expect(preview("name,unit\nGel pen,BOX\n").issues).toEqual([]);
  });

  it("catches a barcode clash in the catalogue and in the file", () => {
    expect(preview("name,barcode\nGel pen,8901234567890\n").issues[0].column).toBe(
      "barcode",
    );
    const twice = preview("name,barcode\nA,111\nB,111\n");
    expect(twice.issues[0]).toMatchObject({ row: 3, column: "barcode" });
  });

  it("catches the same product name twice in one file", () => {
    const result = preview("name\nGel pen\nGel pen\n");
    expect(result.drafts).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ row: 3, column: "name" });
  });

  it("reads amounts with thousands separators and spaces", () => {
    // A thousands separator only survives a CSV if the field is quoted —
    // unquoted, the comma is a delimiter and the file means something else.
    const result = preview('name,price\nRegister," 1,250.50 "\n');
    expect(result.drafts[0].sellingPrice).toBe(1250.5);
  });

  it("refuses an amount that is not a number", () => {
    const result = preview("name,price\nGel pen,sixty\n");
    expect(result.issues[0].column).toBe("selling price");
  });

  it("treats an empty amount as zero rather than an error", () => {
    const result = preview("name,cost,price\nGel pen,,\n");
    expect(result.issues).toEqual([]);
    expect(result.drafts[0]).toMatchObject({ purchasePrice: 0, sellingPrice: 0 });
  });

  it("refuses a negative amount", () => {
    expect(preview("name,price\nGel pen,-5\n").issues[0].column).toBe("selling price");
  });

  it("reports several problems in one row at once", () => {
    const result = preview("name,unit,price\n,Gross,nope\n");
    expect(result.issues.map((i) => i.column)).toEqual(["name", "unit", "selling price"]);
  });

  it("keeps good rows when others are bad", () => {
    const result = preview("name,price\nGel pen,60\n,20\nEraser,10\n");
    expect(result.drafts.map((d) => d.name)).toEqual(["Gel pen", "Eraser"]);
    expect(result.issues).toHaveLength(1);
  });

  it("says when the file has no name column at all", () => {
    const result = preview("colour,size\nblue,large\n");
    expect(result.hasNameColumn).toBe(false);
    expect(result.unknownColumns).toEqual(["colour", "size"]);
  });

  it("handles an empty file without throwing", () => {
    const result = preview("");
    expect(result.drafts).toEqual([]);
    expect(result.hasNameColumn).toBe(false);
  });

  it("round-trips a file written by our own export", () => {
    const exported =
      "Name,SKU,Barcode,Brand,Category,Unit,Purchase price,Selling price\r\n" +
      "Gel pen,GP-9,222,Local,Writing,Piece,40,60\r\n";
    const result = preview(exported);
    expect(result.issues).toEqual([]);
    expect(result.drafts[0]).toMatchObject({ name: "Gel pen", sku: "GP-9" });
    expect(result.unknownColumns).toEqual(["brand"]);
  });
});
