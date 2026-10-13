import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-muted",
        positive: "bg-positive-wash text-positive",
        caution: "bg-caution-wash text-caution",
        critical: "bg-critical-wash text-critical",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
