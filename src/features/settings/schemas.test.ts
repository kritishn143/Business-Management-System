import { describe, expect, it } from "vitest";
import {
  businessProfileSchema,
  localizationFormSchema,
  memberRoleSchema,
} from "./schemas";

const profile = {
  name: "Sunrise Stationers",
  businessType: "retail",
  category: "stationery",
  phone: "",
  email: "",
  address: "",
  registrationNumber: "",
};

const localization = {
  currencyCode: "NPR",
  currencyPosition: "before",
  numberFormat: "en-IN",
  timezone: "Asia/Kathmandu",
  dateSystem: "AD",
  fiscalYearStartMonth: "4",
  fiscalYearStartDay: "1",
};

describe("businessProfileSchema", () => {
  it("stores untouched optional fields as null rather than empty text", () => {
    const parsed = businessProfileSchema.parse(profile);
    expect(parsed.phone).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.registrationNumber).toBeNull();
  });

  it("trims what the user did type", () => {
    const parsed = businessProfileSchema.parse({
      ...profile,
      name: "  Sunrise Stationers  ",
      phone: " 9801234567 ",
    });
    expect(parsed.name).toBe("Sunrise Stationers");
    expect(parsed.phone).toBe("9801234567");
  });

  it("refuses a blank name", () => {
    const result = businessProfileSchema.safeParse({ ...profile, name: "   " });
    expect(result.success).toBe(false);
  });

  it("refuses a malformed email but accepts a real one", () => {
    expect(businessProfileSchema.safeParse({ ...profile, email: "nope" }).success).toBe(
      false,
    );
    expect(
      businessProfileSchema.parse({ ...profile, email: "shop@example.test" }).email,
    ).toBe("shop@example.test");
  });
});

describe("localizationFormSchema", () => {
  it("coerces the fiscal year fields from form strings to numbers", () => {
    const parsed = localizationFormSchema.parse(localization);
    expect(parsed.fiscalYearStartMonth).toBe(4);
    expect(parsed.fiscalYearStartDay).toBe(1);
  });

  it("upper-cases a currency code", () => {
    expect(localizationFormSchema.parse({ ...localization, currencyCode: "npr" }).currencyCode).toBe(
      "NPR",
    );
  });

  it("refuses a currency code that is not three letters", () => {
    expect(
      localizationFormSchema.safeParse({ ...localization, currencyCode: "RUPEE" }).success,
    ).toBe(false);
  });

  it("refuses a fiscal start that the month is too short for", () => {
    // 30 February never happens, in any year.
    const result = localizationFormSchema.safeParse({
      ...localization,
      fiscalYearStartMonth: "2",
      fiscalYearStartDay: "30",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["fiscalYearStartDay"]);
  });

  it("allows 29 February, which leap years do have", () => {
    expect(
      localizationFormSchema.safeParse({
        ...localization,
        fiscalYearStartMonth: "2",
        fiscalYearStartDay: "29",
      }).success,
    ).toBe(true);
  });

  it("refuses a day outside any month", () => {
    expect(
      localizationFormSchema.safeParse({ ...localization, fiscalYearStartDay: "32" }).success,
    ).toBe(false);
    expect(
      localizationFormSchema.safeParse({ ...localization, fiscalYearStartDay: "0" }).success,
    ).toBe(false);
  });
});

describe("memberRoleSchema", () => {
  it("accepts a known role for a real member id", () => {
    const parsed = memberRoleSchema.parse({
      memberId: "0f14d0ab-9605-4a62-a9e4-5ed26688389b",
      role: "cashier",
    });
    expect(parsed.role).toBe("cashier");
  });

  it("refuses a role we do not define", () => {
    expect(
      memberRoleSchema.safeParse({
        memberId: "0f14d0ab-9605-4a62-a9e4-5ed26688389b",
        role: "superuser",
      }).success,
    ).toBe(false);
  });

  it("refuses a member id that is not a uuid", () => {
    expect(memberRoleSchema.safeParse({ memberId: "1", role: "cashier" }).success).toBe(
      false,
    );
  });
});
