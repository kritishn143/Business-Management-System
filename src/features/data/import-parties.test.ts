import { describe, expect, it } from "vitest";
import { parseCsvObjects } from "@/lib/csv";
import { detectPartyColumns, previewPartyImport } from "./import-parties";

const context = { existingNames: new Set(["shree school"]) };
const preview = (csv: string) => previewPartyImport(parseCsvObjects(csv).rows, context);

describe("detectPartyColumns", () => {
  it("recognises our own export's headers", () => {
    const { map } = detectPartyColumns([
      "Name",
      "Phone",
      "Email",
      "Address",
      "Opening balance",
      "Credit limit",
      "Notes",
    ]);
    expect(map.name).toBe("Name");
    expect(map.openingBalance).toBe("Opening balance");
    expect(map.creditLimit).toBe("Credit limit");
  });

  it("recognises the words a shopkeeper would use", () => {
    const { map } = detectPartyColumns(["Customer", "Mobile", "Due", "Remarks"]);
    expect(map.name).toBe("Customer");
    expect(map.phone).toBe("Mobile");
    expect(map.openingBalance).toBe("Due");
    expect(map.notes).toBe("Remarks");
  });

  it("reports what it cannot place", () => {
    const { unknown } = detectPartyColumns(["Name", "Favourite colour"]);
    expect(unknown).toEqual(["Favourite colour"]);
  });
});

describe("previewPartyImport", () => {
  it("accepts a clean file", () => {
    const result = preview(
      "name,mobile,due,limit\nRam Traders,9801234567,1500,5000\n",
    );
    expect(result.issues).toEqual([]);
    expect(result.drafts[0]).toEqual({
      name: "Ram Traders",
      phone: "9801234567",
      email: null,
      address: null,
      openingBalance: 1500,
      creditLimit: 5000,
      notes: null,
    });
  });

  it("accepts a negative opening balance, meaning we owe them", () => {
    const result = preview("name,due\nPaper Depot,-4000\n");
    expect(result.issues).toEqual([]);
    expect(result.drafts[0].openingBalance).toBe(-4000);
  });

  it("treats a missing balance as zero", () => {
    expect(preview("name,due\nRam Traders,\n").drafts[0].openingBalance).toBe(0);
  });

  it("refuses a balance that is not a number", () => {
    expect(preview("name,due\nRam Traders,lots\n").issues[0].column).toBe(
      "opening balance",
    );
  });

  it("refuses a negative credit limit but allows an empty one", () => {
    expect(preview("name,limit\nRam Traders,-10\n").issues[0].column).toBe(
      "credit limit",
    );
    expect(preview("name,limit\nRam Traders,\n").drafts[0].creditLimit).toBeNull();
  });

  it("catches a name the shop already has, whatever the case", () => {
    const result = preview("name\nSHREE SCHOOL\n");
    expect(result.issues[0]).toMatchObject({ row: 2, column: "name" });
    expect(result.drafts).toHaveLength(0);
  });

  it("catches the same name twice in one file", () => {
    const result = preview("name\nRam Traders\nRam Traders\n");
    expect(result.drafts).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ row: 3, column: "name" });
  });

  it("refuses an email that is not one", () => {
    expect(preview("name,email\nRam Traders,ram-at-example\n").issues[0].column).toBe(
      "email",
    );
    expect(preview("name,email\nRam Traders,ram@example.test\n").issues).toEqual([]);
  });

  it("skips blank lines and keeps good rows when others are bad", () => {
    const result = preview("name,due\nRam Traders,100\n,\n,50\nPaper Depot,0\n");
    expect(result.drafts.map((d) => d.name)).toEqual(["Ram Traders", "Paper Depot"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].row).toBe(4);
  });

  it("says when there is no name column", () => {
    expect(preview("phone\n9801234567\n").hasNameColumn).toBe(false);
  });

  it("handles an empty file", () => {
    expect(preview("").drafts).toEqual([]);
  });
});
