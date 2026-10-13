import { describe, expect, it } from "vitest";
import { toDecimalString } from "@/domain/money/decimal";
import { ageBalance } from "./ageing";

const asOf = "2026-09-27";

const money = (m: number) => toDecimalString(m);

describe("ageBalance", () => {
  it("reports nothing owed when the ledger is empty", () => {
    const aged = ageBalance({ entries: [], asOf });
    expect(aged.balance).toBe(0);
    expect(aged.oldestDays).toBeNull();
    expect(aged.unapplied).toBe(0);
  });

  it("puts a fresh invoice in the newest bucket", () => {
    const aged = ageBalance({
      entries: [{ date: "2026-09-20", debit: "1000.00", credit: 0 }],
      asOf,
    });
    expect(money(aged.balance)).toBe("1000.00");
    expect(money(aged.buckets.current)).toBe("1000.00");
    expect(aged.oldestDays).toBe(7);
  });

  it("ages each invoice by its own date", () => {
    const aged = ageBalance({
      entries: [
        { date: "2026-09-20", debit: "100.00", credit: 0 }, //  7 days
        { date: "2026-08-20", debit: "200.00", credit: 0 }, // 38 days
        { date: "2026-07-20", debit: "300.00", credit: 0 }, // 69 days
        { date: "2026-05-20", debit: "400.00", credit: 0 }, // 130 days
      ],
      asOf,
    });

    expect(money(aged.buckets.current)).toBe("100.00");
    expect(money(aged.buckets.d30)).toBe("200.00");
    expect(money(aged.buckets.d60)).toBe("300.00");
    expect(money(aged.buckets.d90)).toBe("400.00");
    expect(money(aged.balance)).toBe("1000.00");
    expect(aged.oldestDays).toBe(130);
  });

  it("boundaries fall on the later bucket's side", () => {
    // Exactly 30 days is no longer "not yet 30 days".
    const thirty = ageBalance({
      entries: [{ date: "2026-08-28", debit: "100.00", credit: 0 }],
      asOf,
    });
    expect(money(thirty.buckets.current)).toBe("0.00");
    expect(money(thirty.buckets.d30)).toBe("100.00");

    const twentyNine = ageBalance({
      entries: [{ date: "2026-08-29", debit: "100.00", credit: 0 }],
      asOf,
    });
    expect(money(twentyNine.buckets.current)).toBe("100.00");
  });

  it("applies a payment to the oldest invoice first", () => {
    const aged = ageBalance({
      entries: [
        { date: "2026-05-20", debit: "400.00", credit: 0 }, // oldest
        { date: "2026-09-20", debit: "100.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "400.00" },
      ],
      asOf,
    });

    // The old debt is cleared, not the recent one.
    expect(money(aged.buckets.d90)).toBe("0.00");
    expect(money(aged.buckets.current)).toBe("100.00");
    expect(money(aged.balance)).toBe("100.00");
    expect(aged.oldestDays).toBe(7);
  });

  it("carries a part payment across into the next invoice", () => {
    const aged = ageBalance({
      entries: [
        { date: "2026-05-20", debit: "400.00", credit: 0 },
        { date: "2026-09-20", debit: "100.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "450.00" },
      ],
      asOf,
    });

    expect(money(aged.buckets.d90)).toBe("0.00");
    expect(money(aged.buckets.current)).toBe("50.00");
    expect(money(aged.balance)).toBe("50.00");
  });

  it("leaves a part payment against the oldest invoice only", () => {
    const aged = ageBalance({
      entries: [
        { date: "2026-05-20", debit: "400.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "150.00" },
      ],
      asOf,
    });
    expect(money(aged.buckets.d90)).toBe("250.00");
    expect(money(aged.balance)).toBe("250.00");
  });

  it("treats an overpayment as an advance, not as a negative age", () => {
    const aged = ageBalance({
      entries: [
        { date: "2026-09-20", debit: "100.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "300.00" },
      ],
      asOf,
    });

    expect(money(aged.balance)).toBe("-200.00");
    expect(money(aged.unapplied)).toBe("200.00");
    expect(money(aged.buckets.current)).toBe("0.00");
    expect(aged.oldestDays).toBeNull();
  });

  it("ages an opening balance from the date it was carried in", () => {
    const aged = ageBalance({
      entries: [{ date: "2026-09-20", debit: "100.00", credit: 0 }],
      openingBalance: "500.00",
      openingDate: "2026-01-01",
      asOf,
    });

    expect(money(aged.buckets.d90)).toBe("500.00");
    expect(money(aged.buckets.current)).toBe("100.00");
    expect(money(aged.balance)).toBe("600.00");
  });

  it("treats a credit opening balance as an advance held for them", () => {
    const aged = ageBalance({
      entries: [{ date: "2026-09-20", debit: "100.00", credit: 0 }],
      openingBalance: "-100.00",
      asOf,
    });
    expect(money(aged.balance)).toBe("0.00");
    expect(money(aged.buckets.current)).toBe("0.00");
  });

  it("does not care what order the ledger arrives in", () => {
    const forwards = ageBalance({
      entries: [
        { date: "2026-05-20", debit: "400.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "400.00" },
        { date: "2026-09-20", debit: "100.00", credit: 0 },
      ],
      asOf,
    });
    const backwards = ageBalance({
      entries: [
        { date: "2026-09-20", debit: "100.00", credit: 0 },
        { date: "2026-09-25", debit: 0, credit: "400.00" },
        { date: "2026-05-20", debit: "400.00", credit: 0 },
      ],
      asOf,
    });
    expect(forwards).toEqual(backwards);
  });

  it("keeps money exact across many small entries", () => {
    const entries = Array.from({ length: 30 }, () => ({
      date: "2026-09-20",
      debit: "10.10",
      credit: 0,
    }));
    const aged = ageBalance({ entries, asOf });
    expect(money(aged.balance)).toBe("303.00");
  });
});
