"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type CatalogFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(80),
});

const unitSchema = z.object({
  name: z.string().trim().min(1, "Give the unit a name.").max(40),
  symbol: z.string().trim().min(1, "Add a short symbol, like pc or box.").max(10),
  baseUnitId: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
  conversionFactor: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : "1"))
    .refine((v) => /^\d+(\.\d{1,6})?$/.test(v), "Enter a number like 12")
    .transform(Number)
    .refine((v) => v > 0, "The conversion must be greater than zero"),
});

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

/** Resolves the caller's business without trusting the browser (SPEC §44). */
async function currentBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.business_id ?? null;
}

export async function createCategoryAction(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const businessId = await currentBusinessId(supabase);
  if (!businessId) return { error: "We couldn't work out which shop this is for." };

  const { error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, name: parsed.data.name });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { name: "You already have a category with that name." } };
    }
    if (error.code === "42501") {
      return { error: "You don't have permission to add categories." };
    }
    console.error("[catalog] category", error.code, error.message);
    return { error: "We couldn't save that category. Please try again." };
  }

  revalidatePath("/inventory/categories");
  return { success: `Added “${parsed.data.name}”.` };
}

export async function createUnitAction(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const parsed = unitSchema.safeParse({
    name: formData.get("name"),
    symbol: formData.get("symbol"),
    baseUnitId: formData.get("baseUnitId"),
    conversionFactor: formData.get("conversionFactor"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const { name, symbol, baseUnitId, conversionFactor } = parsed.data;

  // A base unit is its own identity: the schema requires factor 1.
  if (!baseUnitId && conversionFactor !== 1) {
    return {
      fieldErrors: {
        conversionFactor: "A base unit must convert at 1. Pick what it converts into first.",
      },
    };
  }

  const supabase = await createClient();
  const businessId = await currentBusinessId(supabase);
  if (!businessId) return { error: "We couldn't work out which shop this is for." };

  const { error } = await supabase.from("units").insert({
    business_id: businessId,
    name,
    symbol,
    base_unit_id: baseUnitId,
    conversion_factor: conversionFactor,
  });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { name: "You already have a unit with that name." } };
    }
    if (error.code === "42501") {
      return { error: "You don't have permission to add units." };
    }
    console.error("[catalog] unit", error.code, error.message);
    return { error: "We couldn't save that unit. Please try again." };
  }

  revalidatePath("/inventory/units");
  return { success: `Added “${name}”.` };
}
