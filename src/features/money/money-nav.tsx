import Link from "next/link";

/**
 * The four money screens sit alongside each other now, with no hub above them,
 * so each one carries the way to the others.
 */
const SECTIONS = [
  { key: "accounts", href: "/accounts", label: "Accounts" },
  { key: "expenses", href: "/expenses", label: "Expenses" },
  { key: "income", href: "/income", label: "Other income" },
  { key: "payments", href: "/payments", label: "Payments" },
] as const;

export function MoneyNav({ current }: { current: (typeof SECTIONS)[number]["key"] }) {
  return (
    <nav
      aria-label="Money"
      className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface-sunken p-1"
    >
      {SECTIONS.map((section) => {
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-surface px-3 py-1.5 text-[13px] font-medium text-ink shadow-xs"
                : "rounded-md px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
            }
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
