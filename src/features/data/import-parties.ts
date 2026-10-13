/**
 * Importing customers and suppliers from a spreadsheet (SPEC §23).
 *
 * Same shape as the product importer: one pure function, used for the preview
 * in the browser and again on the server before anything is written.
 */

export type PartyDraft = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Positive means they owe us; negative means we owe them. */
  openingBalance: number;
  creditLimit: number | null;
  notes: string | null;
};

export type PartyRowIssue = { row: number; column: string; message: string };

export type PartyImportPreview = {
  drafts: PartyDraft[];
  issues: PartyRowIssue[];
  unknownColumns: string[];
  hasNameColumn: boolean;
};

const COLUMN_ALIASES: Record<keyof PartyDraft, string[]> = {
  name: ["name", "customer", "supplier", "party", "contact", "business", "shop"],
  phone: ["phone", "mobile", "contact number", "phone number", "tel"],
  email: ["email", "e-mail", "email address"],
  address: ["address", "location", "city"],
  openingBalance: [
    "opening balance",
    "balance",
    "due",
    "outstanding",
    "opening",
  ],
  creditLimit: ["credit limit", "limit"],
  notes: ["notes", "note", "remarks", "comment"],
};

export function detectPartyColumns(headers: string[]): {
  map: Partial<Record<keyof PartyDraft, string>>;
  unknown: string[];
} {
  const map: Partial<Record<keyof PartyDraft, string>> = {};
  const unknown: string[] = [];

  for (const header of headers) {
    const normalised = header.trim().toLowerCase();
    if (normalised === "") continue;

    let placed = false;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      const key = field as keyof PartyDraft;
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

/** A balance may be negative: a supplier we already owe, or a customer advance. */
function parseSigned(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseUnsigned(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// Deliberately permissive: a shop's contact list is not a mailing list, and we
// would rather import a slightly odd address than refuse the row.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PartyImportContext = {
  /** Names already in the shop, lower-cased, so a duplicate is caught early. */
  existingNames: Set<string>;
};

export function previewPartyImport(
  rows: Record<string, string>[],
  context: PartyImportContext,
): PartyImportPreview {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const { map, unknown } = detectPartyColumns(headers);

  const drafts: PartyDraft[] = [];
  const issues: PartyRowIssue[] = [];
  const seenNames = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (Object.values(row).every((v) => v.trim() === "")) return;

    const cell = (field: keyof PartyDraft): string => {
      const header = map[field];
      return header === undefined ? "" : (row[header] ?? "").trim();
    };

    let rowFailed = false;
    const fail = (column: string, message: string) => {
      issues.push({ row: rowNumber, column, message });
      rowFailed = true;
    };

    const name = cell("name");
    if (name === "") fail("name", "Every contact needs a name.");
    if (name.length > 160) fail("name", "That name is too long.");

    const key = name.toLowerCase();
    if (name !== "" && context.existingNames.has(key)) {
      fail("name", "You already have a contact with this name.");
    } else if (name !== "" && seenNames.has(key)) {
      fail("name", "This name appears more than once in the file.");
    }

    const email = cell("email") || null;
    if (email && !EMAIL.test(email)) {
      fail("email", "That doesn't look like an email address.");
    }

    const openingBalance = parseSigned(cell("openingBalance"));
    if (openingBalance === null) {
      fail("opening balance", "Enter an amount like 1500, or -1500 if you owe them.");
    }

    const creditLimitRaw = cell("creditLimit");
    const creditLimit = creditLimitRaw === "" ? null : parseUnsigned(creditLimitRaw);
    if (creditLimitRaw !== "" && creditLimit === null) {
      fail("credit limit", "Enter an amount like 5000, or leave it empty.");
    }

    if (rowFailed) return;

    seenNames.add(key);
    drafts.push({
      name,
      phone: cell("phone") || null,
      email,
      address: cell("address") || null,
      openingBalance: openingBalance ?? 0,
      creditLimit,
      notes: cell("notes") || null,
    });
  });

  return {
    drafts,
    issues,
    unknownColumns: unknown,
    hasNameColumn: map.name !== undefined,
  };
}
