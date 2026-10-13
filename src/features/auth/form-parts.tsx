"use client";

import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  className = "w-full",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} disabled={pending}>
      {pending ? "Just a moment…" : children}
    </Button>
  );
}

export function FormAlert({
  tone,
  children,
}: {
  tone: "critical" | "positive";
  children: React.ReactNode;
}) {
  const Icon = tone === "critical" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={
        tone === "critical"
          ? "flex gap-2.5 rounded-lg bg-critical-wash px-3.5 py-3 text-[13px] text-critical"
          : "flex gap-2.5 rounded-lg bg-positive-wash px-3.5 py-3 text-[13px] text-positive"
      }
    >
      <Icon className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
