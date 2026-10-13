/**
 * CSV that spreadsheets actually accept. RFC 4180 quoting: a field is quoted
 * when it contains a delimiter, a quote or a newline, and an embedded quote is
 * doubled (SPEC §23, §76).
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
};

function escapeField(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const text = String(raw);

  // A leading =, +, - or @ is executed as a formula by Excel and Sheets. This
  // is the standard defence: keep the text, refuse the execution.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeField(c.header)).join(",")];

  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(c.value(row))).join(","));
  }

  // CRLF, because that is what the spec says and what Excel is happiest with.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Parses CSV text into rows of cells. Handles quoted fields containing commas,
 * quotes and newlines, and tolerates both CRLF and LF.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  // Strip a UTF-8 byte order mark, which Excel likes to add.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < input.length) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += char === "\r" && input[i + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // A file that does not end in a newline still has a last row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Trailing blank lines are not data.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** A parsed file as objects keyed by its header row, lower-cased and trimmed. */
export function parseCsvObjects(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const rows = grid.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}
