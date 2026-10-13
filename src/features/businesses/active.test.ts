import { describe, expect, it } from "vitest";
import { orderByActive } from "./active";

const shop = (id: string) => ({ business: { id }, role: "owner" as const });
const ids = (list: { business: { id: string } }[]) => list.map((m) => m.business.id);

describe("orderByActive", () => {
  const memberships = [shop("a"), shop("b"), shop("c")];

  it("leaves the order alone when nothing is chosen", () => {
    expect(ids(orderByActive(memberships, null))).toEqual(["a", "b", "c"]);
  });

  it("brings the chosen business to the front", () => {
    expect(ids(orderByActive(memberships, "c"))).toEqual(["c", "a", "b"]);
  });

  it("keeps the others in their original order behind it", () => {
    expect(ids(orderByActive(memberships, "b"))).toEqual(["b", "a", "c"]);
  });

  it("does nothing when the chosen one is already first", () => {
    expect(ids(orderByActive(memberships, "a"))).toEqual(["a", "b", "c"]);
  });

  it("ignores a choice the user has no membership for", () => {
    // The list has already been filtered by the database to this user's own
    // memberships, so an id that is not in it must select nothing at all —
    // never another shop, and never an empty list.
    expect(ids(orderByActive(memberships, "someone-elses-shop"))).toEqual(["a", "b", "c"]);
  });

  it("never drops or duplicates a membership", () => {
    for (const chosen of [null, "a", "b", "c", "unknown"]) {
      const result = orderByActive(memberships, chosen);
      expect(result).toHaveLength(3);
      expect(new Set(ids(result))).toEqual(new Set(["a", "b", "c"]));
    }
  });

  it("copes with a single membership, and with none", () => {
    expect(ids(orderByActive([shop("only")], "only"))).toEqual(["only"]);
    expect(orderByActive([], "a")).toEqual([]);
  });
});
