"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import { FormAlert } from "@/features/auth/form-parts";
import { parseCsvObjects } from "@/lib/csv";
import { importPartiesAction } from "./import-actions";
import { previewPartyImport, type PartyImportPreview } from "./import-parties";

const MAX_ROWS = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

export function ImportPartiesForm({
  kind,
  existingNames,
}: {
  kind: "customer" | "supplier";
  existingNames: string[];
}) {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [preview, setPreview] = React.useState<PartyImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  const noun = kind === "customer" ? "customer" : "supplier";

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

    const parsed = parseCsvObjects(await file.text());

    if (parsed.rows.length === 0) {
      setError("That file has a header but no rows.");
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      setError(`That file has ${parsed.rows.length} rows. Import up to ${MAX_ROWS} at a time.`);
      return;
    }

    setRows(parsed.rows);
    setPreview(
      previewPartyImport(parsed.rows, {
        existingNames: new Set(existingNames.map((n) => n.toLowerCase())),
      }),
    );
  }

  async function confirm() {
    setImporting(true);
    const result = await importPartiesAction(kind, rows);
    setImporting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success(
      `${result.imported} ${result.imported === 1 ? noun : `${noun}s`} imported.`,
    );
    router.push(kind === "customer" ? "/customers" : "/suppliers");
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
            A header row, then one {noun} per row. Up to {MAX_ROWS} rows.
          </span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
        </label>

        <div className="mt-4 text-[13px] text-ink-muted">
          <p className="font-medium text-ink">Columns we recognise</p>
          <p className="mt-1">
            name, phone, email, address, opening balance, credit limit, notes.
            Alternatives work too — customer, mobile, due, remarks.
          </p>
          <p className="mt-2">
            An opening balance is what they owe you. Write it as a negative number
            if you owe them instead.
          </p>
        </div>
      </div>

      {error ? <FormAlert tone="critical">{error}</FormAlert> : null}

      {preview && !preview.hasNameColumn ? (
        <FormAlert tone="critical">
          We couldn&rsquo;t find a name column. Name one of your columns
          &ldquo;name&rdquo; and try again.
        </FormAlert>
      ) : null}

      {preview?.hasNameColumn ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-raised px-5 py-4">
            <div>
              <p className="text-sm text-ink">
                <strong className="font-semibold">{preview.drafts.length}</strong>{" "}
                {preview.drafts.length === 1 ? noun : `${noun}s`} ready to import
                {issuesByRow.size > 0 ? (
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
              {importing ? "Importing…" : `Import ${preview.drafts.length}`}
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
                      <Th>Name</Th>
                      <Th>Phone</Th>
                      <Th>Email</Th>
                      <Th className="text-right">Opening balance</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.drafts.slice(0, 50).map((draft, i) => (
                      <Tr key={`${draft.name}-${i}`}>
                        <Td className="font-medium">{draft.name}</Td>
                        <Td className="text-ink-muted">{draft.phone ?? "—"}</Td>
                        <Td className="text-ink-muted">{draft.email ?? "—"}</Td>
                        <Td className="tabular text-right">{draft.openingBalance}</Td>
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
