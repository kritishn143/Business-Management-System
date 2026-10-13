import { describe, expect, it } from "vitest";
import { searchCachedProducts, type CachedProduct } from "./catalogue";

const product = (over: Partial<CachedProduct>): CachedProduct => ({
  id: over.name ?? "id",
  name: "Product",
  sku: null,
  barcode: null,
  unitId: "u1",
  unitSymbol: "pc",
  sellingPrice: "10.00",
  stock: "5",
  ...over,
});

const catalogue = [
  product({ name: "Gel pen, blue", sku: "GP-1", barcode: "8901" }),
  product({ name: "Gel pen, black", sku: "GP-2", barcode: "8902" }),
  product({ name: "Ball pen", sku: "BP-1" }),
  product({ name: "A4 paper ream", sku: "PR-1" }),
  product({ name: "Pencil HB", sku: "PN-1" }),
];

describe("searchCachedProducts", () => {
  it("returns the head of the catalogue for an empty search", () => {
    expect(searchCachedProducts(catalogue, "", 2)).toHaveLength(2);
  });

  it("finds by name, ignoring case", () => {
    const found = searchCachedProducts(catalogue, "GEL");
    expect(found.map((p) => p.name)).toEqual(["Gel pen, black", "Gel pen, blue"]);
  });

  it("finds by name from the middle of the word", () => {
    expect(searchCachedProducts(catalogue, "ream").map((p) => p.name)).toEqual([
      "A4 paper ream",
    ]);
  });

  it("finds by SKU", () => {
    expect(searchCachedProducts(catalogue, "bp-1").map((p) => p.name)).toEqual([
      "Ball pen",
    ]);
  });

  it("puts an exact barcode match first, the way a scanner expects", () => {
    const withDecoy = [product({ name: "Aaa first alphabetically", barcode: "8902x" }), ...catalogue];
    expect(searchCachedProducts(withDecoy, "8902")[0].name).toBe("Gel pen, black");
  });

  it("prefers an exact SKU over a name that merely contains the text", () => {
    const list = [product({ name: "Box of GP-1 refills" }), product({ name: "Gel pen", sku: "GP-1" })];
    expect(searchCachedProducts(list, "GP-1")[0].name).toBe("Gel pen");
  });

  it("prefers a name that starts with the text over one that contains it", () => {
    const list = [
      product({ name: "Blue gel pen" }),
      product({ name: "Gel pen refill" }),
    ];
    expect(searchCachedProducts(list, "gel")[0].name).toBe("Gel pen refill");
  });

  it("returns nothing when nothing matches", () => {
    expect(searchCachedProducts(catalogue, "stapler")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchCachedProducts(catalogue, "pen", 1)).toHaveLength(1);
  });

  it("ignores surrounding whitespace, as a scanner often adds it", () => {
    expect(searchCachedProducts(catalogue, "  GP-2  ").map((p) => p.name)).toEqual([
      "Gel pen, black",
    ]);
  });
});
