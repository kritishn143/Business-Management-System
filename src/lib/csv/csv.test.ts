import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "./index";

type Row = { name: string; qty: number; note: string | null };

const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Qty", value: (r: Row) => r.qty },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("writes a header even with no rows", () => {
    expect(toCsv<Row>([], columns)).toBe("Name,Qty,Note\r\n");
  });

  it("writes plain values unquoted", () => {
    expect(toCsv([{ name: "Gel pen", qty: 12, note: null }], columns)).toBe(
      "Name,Qty,Note\r\nGel pen,12,\r\n",
    );
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv([{ name: "Pen, blue", qty: 1, note: null }], columns);
    expect(csv).toContain('"Pen, blue"');
  });

  it("doubles an embedded quote", () => {
    const csv = toCsv([{ name: 'A4 "premium"', qty: 1, note: null }], columns);
    expect(csv).toContain('"A4 ""premium"""');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ name: "Line one\nLine two", qty: 1, note: null }], columns);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("neutralises a value a spreadsheet would run as a formula", () => {
    const csv = toCsv([{ name: "=1+1", qty: 1, note: "@SUM(A1)" }], columns);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1)");
  });
});

describe("parseCsv", () => {
  it("reads a simple grid", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("accepts LF-only line endings", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads a quoted field containing a comma", () => {
    expect(parseCsv('name,qty\n"Pen, blue",2\n')).toEqual([
      ["name", "qty"],
      ["Pen, blue", "2"],
    ]);
  });

  it("reads a doubled quote back as one quote", () => {
    expect(parseCsv('name\n"A4 ""premium"""\n')).toEqual([["name"], ['A4 "premium"']]);
  });

  it("reads a newline inside a quoted field", () => {
    expect(parseCsv('note\n"one\ntwo"\n')).toEqual([["note"], ["one\ntwo"]]);
  });

  it("keeps the last row when the file does not end in a newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops a byte order mark rather than gluing it to the first header", () => {
    expect(parseCsv("﻿name,qty\nPen,1\n")[0]).toEqual(["name", "qty"]);
  });

  it("ignores trailing blank lines", () => {
    expect(parseCsv("a\n1\n\n\n")).toEqual([["a"], ["1"]]);
  });

  it("round-trips what toCsv writes", () => {
    const rows: Row[] = [
      { name: 'Pen, "blue"', qty: 12, note: "one\ntwo" },
      { name: "Eraser", qty: 3, note: null },
    ];
    const grid = parseCsv(toCsv(rows, columns));
    expect(grid[1]).toEqual(['Pen, "blue"', "12", "one\ntwo"]);
    expect(grid[2]).toEqual(["Eraser", "3", ""]);
  });
});

describe("parseCsvObjects", () => {
  it("keys rows by a normalised header", () => {
    const { headers, rows } = parseCsvObjects(" Name , SKU \nGel pen, GP-1\n");
    expect(headers).toEqual(["name", "sku"]);
    expect(rows).toEqual([{ name: "Gel pen", sku: "GP-1" }]);
  });

  it("fills a missing trailing cell rather than leaving it undefined", () => {
    const { rows } = parseCsvObjects("name,sku\nGel pen\n");
    expect(rows[0]).toEqual({ name: "Gel pen", sku: "" });
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsvObjects("")).toEqual({ headers: [], rows: [] });
  });
});
