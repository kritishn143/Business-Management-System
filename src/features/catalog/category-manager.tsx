"use client";

import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/features/auth/form-parts";
import { createCategoryAction, type CatalogFormState } from "./actions";

const INITIAL: CatalogFormState = {};

export function CategoryForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: CatalogFormState, formData: FormData) => {
      const result = await createCategoryAction(prev, formData);
      if (result.success) {
        toast.success(result.success);
        formRef.current?.reset();
      }
      return result;
    },
    INITIAL,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error ? <FormAlert tone="critical">{state.error}</FormAlert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">New category</Label>
        <div className="flex gap-2">
          <Input
            id="name"
            name="name"
            placeholder="e.g. Writing, Paper, Files"
            required
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <Button type="submit" disabled={pending} className="shrink-0">
            <Plus />
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
        {state.fieldErrors?.name ? (
          <p className="text-[13px] text-critical">{state.fieldErrors.name}</p>
        ) : null}
      </div>
    </form>
  );
}
