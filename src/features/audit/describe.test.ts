import { describe, expect, it } from "vitest";
import { changedFields, describeAction, entityLabel, subjectOf } from "./describe";
import type { AuditEvent } from "./queries";

function event(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "e1",
    action: "updated",
    entityType: "sales",
    entityId: "s1",
    actor: "Asha Rai",
    createdAt: "2026-09-27T06:45:00Z",
    oldData: null,
    newData: null,
    ...over,
  };
}

describe("entityLabel", () => {
  it("names the tables a shopkeeper would recognise", () => {
    expect(entityLabel("sales")).toBe("sale");
    expect(entityLabel("party_ledger_entries")).toBe("ledger entry");
    expect(entityLabel("business_members")).toBe("staff access");
  });

  it("falls back to a readable form of an unmapped table", () => {
    expect(entityLabel("some_new_table")).toBe("some new table");
  });
});

describe("describeAction", () => {
  it("uses plain verbs by default", () => {
    expect(describeAction(event({ action: "created" }))).toBe("added");
    expect(describeAction(event({ action: "updated" }))).toBe("changed");
    expect(describeAction(event({ action: "deleted" }))).toBe("removed");
  });

  it("uses a table's own wording where a generic verb would read oddly", () => {
    expect(describeAction(event({ entityType: "businesses", action: "created" }))).toBe(
      "set up",
    );
  });
});

describe("subjectOf", () => {
  it("prefers the identifier a person would quote", () => {
    expect(
      subjectOf(
        event({ newData: { invoice_number: "SAL-000042", total_amount: "1000.00" } }),
      ),
    ).toBe("SAL-000042");
  });

  it("falls back through the preference list", () => {
    expect(subjectOf(event({ newData: { total_amount: "250.00" } }))).toBe("250.00");
    expect(subjectOf(event({ newData: { name: "Gel pen" } }))).toBe("Gel pen");
  });

  it("reads a deletion from what used to be there", () => {
    expect(
      subjectOf(event({ action: "deleted", newData: null, oldData: { name: "Eraser" } })),
    ).toBe("Eraser");
  });

  it("skips empty values rather than showing a blank subject", () => {
    expect(subjectOf(event({ newData: { name: "", description: "Rent" } }))).toBe("Rent");
  });

  it("skips a zero amount, which identifies nothing", () => {
    // A sale is created as a draft with a zero total; "sale · 0" is no help.
    expect(subjectOf(event({ newData: { name: null, total_amount: 0 } }))).toBeNull();
    expect(
      subjectOf(event({ newData: { total_amount: "0.00", description: "Rent" } })),
    ).toBe("Rent");
  });

  it("returns null when there is nothing worth naming", () => {
    expect(subjectOf(event({ newData: {} }))).toBeNull();
    expect(subjectOf(event())).toBeNull();
  });
});

describe("changedFields", () => {
  it("lists only what actually changed", () => {
    const changes = changedFields(
      event({
        oldData: { name: "Gel pen", selling_price: "60.00", brand: "Local" },
        newData: { name: "Gel pen", selling_price: "65.00", brand: "Local" },
      }),
    );
    expect(changes).toEqual([{ field: "selling price", from: "60.00", to: "65.00" }]);
  });

  it("ignores bookkeeping columns nobody wants to read about", () => {
    const changes = changedFields(
      event({
        oldData: { id: "a", business_id: "b", updated_at: "1", name: "Old" },
        newData: { id: "a", business_id: "b", updated_at: "2", name: "New" },
      }),
    );
    expect(changes.map((c) => c.field)).toEqual(["name"]);
  });

  it("shows a value arriving and a value leaving", () => {
    const changes = changedFields(
      event({ oldData: { phone: null }, newData: { phone: "9801234567" } }),
    );
    expect(changes).toEqual([{ field: "phone", from: "—", to: "9801234567" }]);
  });

  it("says nothing for a creation or a deletion", () => {
    expect(changedFields(event({ action: "created", newData: { name: "New" } }))).toEqual([]);
    expect(changedFields(event({ action: "deleted", oldData: { name: "Gone" } }))).toEqual([]);
  });
});

describe("describeAction for an account entry taken back", () => {
  const movement = (over: Partial<AuditEvent>) =>
    event({ entityType: "account_movements", action: "updated", ...over });

  it("says it was taken back rather than listing the columns that changed", () => {
    expect(
      describeAction(
        movement({
          oldData: { undone_at: null, money_in: "100" },
          newData: { undone_at: "2026-09-27T12:00:00Z", money_in: "100" },
        }),
      ),
    ).toBe("took back");
  });

  it("and put back the other way round", () => {
    expect(
      describeAction(
        movement({
          oldData: { undone_at: "2026-09-27T12:00:00Z" },
          newData: { undone_at: null },
        }),
      ),
    ).toBe("put back");
  });

  it("falls back to the plain verb when the change was something else", () => {
    expect(
      describeAction(
        movement({ oldData: { note: "a", undone_at: null }, newData: { note: "b", undone_at: null } }),
      ),
    ).toBe("changed");
  });

  it("hides the bookkeeping columns an undo writes", () => {
    const changes = changedFields(
      movement({
        oldData: { undone_at: null, undone_by: null, note: "Typo" },
        newData: { undone_at: "2026-09-27T12:00:00Z", undone_by: "u1", note: "Typo" },
      }),
    );
    expect(changes).toEqual([]);
  });

  it("hides internal ids, which tell a shopkeeper nothing", () => {
    const changes = changedFields(
      event({
        oldData: { account_id: "a1", amount: "100", category_id: "c1" },
        newData: { account_id: "a2", amount: "150", category_id: "c2" },
      }),
    );
    expect(changes.map((c) => c.field)).toEqual(["amount"]);
  });
});
