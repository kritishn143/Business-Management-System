"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/features/auth/form-parts";
import { createProductAction, type ProductFormState } from "./actions";
import type { ProductFormOptions } from "./queries";

const INITIAL: ProductFormState = {};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6 first:border-0 first:pt-0">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function ProductForm({ options }: { options: ProductFormOptions }) {
  const [state, formAction] = useActionState(createProductAction, INITIAL);

  return (
    <form action={formAction} className="space-y-8">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <Section title="What is it">
        <Field
          id="name"
          label="Product name"
          placeholder="e.g. Gel Pen 0.5mm Blue"
          autoFocus
          required
          error={state.fieldErrors?.name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="sku"
            label="SKU"
            placeholder="Optional"
            hint="Your own code for this item."
            error={state.fieldErrors?.sku}
          />
          <Field
            id="barcode"
            label="Barcode"
            placeholder="Optional"
            hint="Scan or type it."
            error={state.fieldErrors?.barcode}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">Category</Label>
            <Select id="categoryId" name="categoryId" defaultValue="">
              <option value="">Uncategorised</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="baseUnitId">Counted in</Label>
            <Select
              id="baseUnitId"
              name="baseUnitId"
              required
              defaultValue={options.units[0]?.id ?? ""}
              aria-invalid={state.fieldErrors?.baseUnitId ? true : undefined}
            >
              {options.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.symbol})
                </option>
              ))}
            </Select>
            {state.fieldErrors?.baseUnitId ? (
              <p className="text-[13px] text-critical">{state.fieldErrors.baseUnitId}</p>
            ) : (
              <p className="text-[13px] text-ink-subtle">
                Stock is always counted in this unit.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Pricing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="purchasePrice"
            label="What you pay"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.purchasePrice}
          />
          <Field
            id="sellingPrice"
            label="What you charge"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            error={state.fieldErrors?.sellingPrice}
          />
        </div>
      </Section>

      <Section
        title="Stock"
        description="Opening stock is recorded as a ledger entry, so it stays auditable."
      >
        <label className="flex items-start gap-3 rounded-lg border border-line p-3.5">
          <input
            type="checkbox"
            id="trackInventory"
            name="trackInventory"
            defaultChecked
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Track stock</span>
            <span className="block text-[13px] text-ink-muted">
              Turn this off for services or items you never count.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="openingStock"
            label="Opening stock"
            type="text"
            inputMode="decimal"
            placeholder="0"
            className="tabular"
            hint="How many you have right now."
            error={state.fieldErrors?.openingStock}
          />
          <Field
            id="minimumStock"
            label="Warn me below"
            type="text"
            inputMode="decimal"
            placeholder="0"
            className="tabular"
            hint="Leave at 0 for no low-stock warning."
            error={state.fieldErrors?.minimumStock}
          />
        </div>
      </Section>

      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <Button variant="secondary" asChild>
          <Link href="/inventory">Cancel</Link>
        </Button>
        <div className="w-40">
          <SubmitButton>Save product</SubmitButton>
        </div>
      </div>
    </form>
  );
}
