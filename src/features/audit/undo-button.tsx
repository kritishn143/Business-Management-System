"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  undoMovementAction,
  type AccountFormState,
} from "@/features/money/account-actions";

const INITIAL: AccountFormState = {};

/**
 * One button that swaps meaning: undo while the entry counts, redo once it has
 * been taken back. This is the only place either happens, so the history and
 * the act of changing it sit together (SPEC §69).
 */
export function UndoEventButton({
  movementId,
  undone,
  canUndo,
  isTransfer,
}: {
  movementId: string;
  undone: boolean;
  canUndo: boolean;
  isTransfer: boolean;
}) {
  const [state, formAction] = useActionState(
    async (prev: AccountFormState, data: FormData) => {
      const result = await undoMovementAction(prev, data);
      if (result.success) toast.success(result.success);
      if (result.error) toast.error(result.error);
      return result;
    },
    INITIAL,
  );

  if (!canUndo) {
    return (
      <span className="text-[13px] text-ink-subtle">
        {undone ? "taken back" : "over a week old"}
      </span>
    );
  }

  const Icon = undone ? RotateCw : RotateCcw;

  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="movementId" value={movementId} />
      <input type="hidden" name="undone" value={undone ? "false" : "true"} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        title={
          undone
            ? isTransfer
              ? "Put this transfer back in both accounts"
              : "Put this entry back"
            : isTransfer
              ? "Take this transfer back from both accounts"
              : "Take this entry back"
        }
      >
        <Icon />
        {undone ? "Redo" : "Undo"}
      </Button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}
