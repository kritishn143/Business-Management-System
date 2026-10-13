import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface-raised",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("px-6 pt-6 pb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-base font-semibold tracking-tight text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("mt-1 text-sm text-ink-muted", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}
