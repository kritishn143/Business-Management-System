import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PostgREST resolves an embed hint written after ":" as a column name. Most of
 * this schema's foreign keys are composite — (product_id, business_id) rather
 * than product_id alone, so that the two can never disagree — and a column hint
 * cannot identify a composite relationship. The query fails at runtime with
 * PGRST200, which no type checker or build catches.
 *
 * Write the constraint name instead: `products!sale_items_product_same_business`.
 */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      found.push(path);
    }
  }
  return found;
}

/** Foreign keys that are a single column, where a column hint does work. */
const SINGLE_COLUMN_FKS = new Set(["business_id"]);

describe("Supabase embeds", () => {
  it("never hint a relationship by column name", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/([a-zA-Z_]+):([a-z_]+_id) ?\(/g)) {
        if (SINGLE_COLUMN_FKS.has(match[2])) continue;
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
