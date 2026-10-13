"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/40",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
