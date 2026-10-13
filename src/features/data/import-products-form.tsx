"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { FormAlert } from "@/features/auth/form-parts";
import { parseCsvObjects } from "@/lib/csv";
import { importProductsAction } from "./import-actions";
import { previewProductImport, type ImportPreview } from "./import-products";

export type ImportOptions = {
  unitNames: string[];
  categoryNames: string[];
  existingSkus: string[];
  existingBarcodes: string[];
  defaultUnitName: string;
};

const MAX_ROWS = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

export function ImportProductsForm({ options }: { options: ImportOptions }) {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreview(null);
    setRows([]);
    setFileName(file.name);

    if (file.size > MAX_BYTES) {
      setError("That file is larger than 2 MB. Split it into smaller batches.");
      return;
    }

    const text = await file.text();
    const parsed = parseCsvObjects(text);

    if (parsed.rows.length === 0) {
      setError("That file has a header but no rows.");
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      setError(`That file has ${parsed.rows.length} rows. Import up to ${MAX_ROWS} at a time.`);
      return;
    }

    // Exactly the check the server will run again before writing anything.
    setRows(parsed.rows);
    setPreview(
      previewProductImport(parsed.rows, {
        unitNames: new Set(options.unitNames.map((n) => n.toLowerCase())),
        categoryNames: new Set(options.categoryNames.map((n) => n.toLowerCase())),
        existingSkus: new Set(options.existingSkus.map((s) => s.toLowerCase())),
        existingBarcodes: new Set(options.existingBarcodes.map((b) => b.toLowerCase())),
        defaultUnitName: options.defaultUnitName,
      }),
    );
  }

  async function confirm() {
    setImporting(true);
    const result = await importProductsAction(rows);
    setImporting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success(
      `${result.imported} ${result.imported === 1 ? "product" : "products"} imported.`,
    );
    router.push("/inventory");
  }

  const issuesByRow = new Map<number, string[]>();
  for (const issue of preview?.issues ?? []) {
    const list = issuesByRow.get(issue.row) ?? [];
    list.push(`${issue.column}: ${issue.message}`);
    issuesByRow.set(issue.row, list);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent-wash/40">
          <FileUp className="size-6 text-ink-subtle" aria-hidden />
          <span className="text-sm font-medium text-ink">
            {fileName ?? "Choose a CSV file"}
          </span>
          <span className="text-[13px] text-ink-muted">
            A header row, then one product per row. Up to {MAX_ROWS} rows.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onFile}
          />
        </label>

        <div className="mt-4 text-[13px] text-ink-muted">
          <p className="font-medium text-ink">Columns we recognise</p>
          <p className="mt-1">
            name, sku, barcode, unit, category, purchase price, selling price,
            minimum stock, opening stock. Common alternatives work too — item,
            code, cost, price, qty. Anything else is ignored, and we will say so.
          </p>
        </div>
      </div>

      {error ? <FormAlert tone="critical">{error}</FormAlert> : null}

      {preview && !preview.hasNameColumn ? (
        <FormAlert tone="critical">
          We couldn&rsquo;t find a product name column. Name one of your columns
          &ldquo;name&rdquo; and try again.
        </FormAlert>
      ) : null}

      {preview?.hasNameColumn ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-raised px-5 py-4">
            <div>
              <p className="text-sm text-ink">
                <strong className="font-semibold">{preview.drafts.length}</strong>{" "}
                {preview.drafts.length === 1 ? "product" : "products"} ready to import
                {preview.issues.length > 0 ? (
                  <>
                    {" · "}
                    <span className="text-critical">
                      {issuesByRow.size} {issuesByRow.size === 1 ? "row" : "rows"} will be
                      skipped
                    </span>
                  </>
                ) : null}
              </p>
              {preview.unknownColumns.length > 0 ? (
                <p className="mt-1 text-[13px] text-ink-subtle">
                  Ignoring: {preview.unknownColumns.join(", ")}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={confirm}
              disabled={importing || preview.drafts.length === 0}
            >
              {importing
                ? "Importing…"
                : `Import ${preview.drafts.length} ${preview.drafts.length === 1 ? "product" : "products"}`}
            </Button>
          </div>

          {issuesByRow.size > 0 ? (
            <div className="rounded-xl border border-critical/30 bg-critical-wash px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-medium text-critical">
                <CircleAlert className="size-4" aria-hidden />
                Rows that will be skipped
              </h2>
              <ul className="mt-2 space-y-1 text-[13px] text-critical">
                {[...issuesByRow.entries()].slice(0, 20).map(([row, messages]) => (
                  <li key={row}>
                    Row {row} — {messages.join("; ")}
                  </li>
                ))}
              </ul>
              {issuesByRow.size > 20 ? (
                <p className="mt-2 text-[13px] text-critical">
                  and {issuesByRow.size - 20} more.
                </p>
              ) : null}
            </div>
          ) : null}

          {preview.drafts.length > 0 ? (
            <div>
              <h2 className="mb-3 text-base font-semibold text-ink">
                What will be created
              </h2>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th>SKU</Th>
                      <Th>Unit</Th>
                      <Th>Category</Th>
                      <Th className="text-right">Cost</Th>
                      <Th className="text-right">Price</Th>
                      <Th className="text-right">Opening stock</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.drafts.slice(0, 50).map((draft, i) => (
                      <Tr key={`${draft.name}-${i}`}>
                        <Td className="font-medium">{draft.name}</Td>
                        <Td className="text-ink-muted">{draft.sku ?? "—"}</Td>
                        <Td className="text-ink-muted">{draft.unitName}</Td>
                        <Td className="text-ink-muted">{draft.categoryName ?? "—"}</Td>
                        <Td className="tabular text-right">{draft.purchasePrice}</Td>
                        <Td className="tabular text-right">{draft.sellingPrice}</Td>
                        <Td className="tabular text-right">{draft.openingStock}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              {preview.drafts.length > 50 ? (
                <p className="mt-3 text-[13px] text-ink-subtle">
                  Showing the first 50 of {preview.drafts.length}. All of them will be
                  imported.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
