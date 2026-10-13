import { describe, expect, it } from "vitest";
import { canReopen, closableYear, hasEnded, isCurrent, type YearShape } from "./rules";

const year = (over: Partial<YearShape>): YearShape => ({
  id: over.startsOn ?? "y",
  startsOn: "2026-04-01",
  endsOn: "2027-03-31",
  status: "open",
  ...over,
});

const y2024 = year({ startsOn: "2024-04-01", endsOn: "2025-03-31" });
const y2025 = year({ startsOn: "2025-04-01", endsOn: "2026-03-31" });
const y2026 = year({ startsOn: "2026-04-01", endsOn: "2027-03-31" });

const today = "2026-09-27";

describe("hasEnded", () => {
  it("is true once the last day has passed", () => {
    expect(hasEnded(y2025, today)).toBe(true);
  });

  it("is false for the year in progress", () => {
    expect(hasEnded(y2026, today)).toBe(false);
  });

  it("is false on the last day itself — the year is still running", () => {
    expect(hasEnded({ endsOn: today }, today)).toBe(false);
  });
});

describe("isCurrent", () => {
  it("recognises the year containing today", () => {
    expect(isCurrent(y2026, today)).toBe(true);
    expect(isCurrent(y2025, today)).toBe(false);
  });

  it("includes both boundary days", () => {
    expect(isCurrent({ startsOn: today, endsOn: "2027-03-31" }, today)).toBe(true);
    expect(isCurrent({ startsOn: "2026-04-01", endsOn: today }, today)).toBe(true);
  });
});

describe("closableYear", () => {
  it("picks the earliest finished year that is still open", () => {
    expect(closableYear([y2026, y2025, y2024], today)?.startsOn).toBe("2024-04-01");
  });

  it("ignores a year already closed", () => {
    const closed = { ...y2024, status: "closed" as const };
    expect(closableYear([y2026, y2025, closed], today)?.startsOn).toBe("2025-04-01");
  });

  it("never offers the year in progress", () => {
    expect(closableYear([y2026], today)).toBeNull();
  });

  it("offers nothing when every finished year is closed", () => {
    const years = [
      { ...y2024, status: "closed" as const },
      { ...y2025, status: "closed" as const },
      y2026,
    ];
    expect(closableYear(years, today)).toBeNull();
  });

  it("does not care what order the years arrive in", () => {
    expect(closableYear([y2025, y2024, y2026], today)?.startsOn).toBe("2024-04-01");
    expect(closableYear([y2024, y2026, y2025], today)?.startsOn).toBe("2024-04-01");
  });

  it("offers nothing for a shop with no years yet", () => {
    expect(closableYear([], today)).toBeNull();
  });
});

describe("canReopen", () => {
  it("allows reopening the most recently closed year", () => {
    const closed2024 = { ...y2024, status: "closed" as const };
    expect(canReopen(closed2024, [closed2024, y2025, y2026])).toBe(true);
  });

  it("refuses reopening underneath a later closed year", () => {
    // 2025's opening position came from 2024's close, so 2025 goes first.
    const closed2024 = { ...y2024, status: "closed" as const };
    const closed2025 = { ...y2025, status: "closed" as const };
    expect(canReopen(closed2024, [closed2024, closed2025, y2026])).toBe(false);
    expect(canReopen(closed2025, [closed2024, closed2025, y2026])).toBe(true);
  });

  it("refuses reopening a year that is already open", () => {
    expect(canReopen(y2025, [y2024, y2025])).toBe(false);
  });
});
