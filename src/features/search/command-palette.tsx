"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ChartNoAxesColumn,
  ClipboardList,
  Database,
  FileText,
  History,
  LayoutGrid,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { globalSearch, type SearchHit } from "./actions";

const ACTIONS = [
  { label: "New sale", href: "/sales/new", icon: Receipt, keywords: "invoice pos bill" },
  { label: "Add a product", href: "/inventory/products/new", icon: Boxes, keywords: "item stock sku" },
  { label: "Record a purchase", href: "/purchases/new", icon: ShoppingCart, keywords: "supplier stock in" },
  { label: "Record an expense", href: "/expenses", icon: ArrowLeftRight, keywords: "cost spend money out" },
  { label: "Record a payment", href: "/payments", icon: ArrowLeftRight, keywords: "receive settle due customer supplier" },
  { label: "Import products", href: "/inventory/products/import", icon: Boxes, keywords: "csv spreadsheet bulk catalogue" },
] as const;

const PAGES = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid, keywords: "home dashboard" },
  { label: "Sales", href: "/sales", icon: Receipt, keywords: "invoices pos" },
  { label: "Inventory", href: "/inventory", icon: Boxes, keywords: "products stock items" },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart, keywords: "bills stock in" },
  { label: "Customers", href: "/customers", icon: Users, keywords: "parties buyers receivables" },
  { label: "Suppliers", href: "/suppliers", icon: Truck, keywords: "parties vendors payables" },
  { label: "Accounts", href: "/accounts", icon: Wallet, keywords: "money cash bank wallet drawer balance" },
  { label: "Expenses", href: "/expenses", icon: ArrowLeftRight, keywords: "money out rent salary spending" },
  { label: "Other income", href: "/income", icon: ArrowLeftRight, keywords: "money in commission service" },
  { label: "Reports", href: "/reports", icon: ChartNoAxesColumn, keywords: "profit statements" },
  { label: "Settings", href: "/settings", icon: Settings, keywords: "business preferences users" },
  { label: "Sales returns", href: "/sales/returns", icon: Undo2, keywords: "refund returned goods back" },
  { label: "Purchase returns", href: "/purchases/returns", icon: Undo2, keywords: "supplier returned goods back" },
  { label: "Stock adjustments", href: "/inventory/adjustments", icon: ClipboardList, keywords: "damage count correction opening" },
  { label: "Payments", href: "/payments", icon: ArrowLeftRight, keywords: "receive pay settle due" },
  { label: "Activity", href: "/settings/activity", icon: History, keywords: "audit log history who changed" },
  { label: "Your data", href: "/settings/data", icon: Database, keywords: "export csv backup download" },
  { label: "Financial years", href: "/settings/fiscal-years", icon: CalendarClock, keywords: "fiscal year close closing books" },
  { label: "Invoice settings", href: "/settings/invoices", icon: FileText, keywords: "logo terms template print receipt" },
] as const;

const GROUPS = ["Products", "Customers", "Suppliers", "Invoices"] as const;

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle";

const ITEM =
  "flex cursor-default items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink data-[selected=true]:bg-accent-wash";

/** Local entries match on their label or their hidden synonyms. */
function matches(entry: { label: string; keywords: string }, term: string) {
  if (!term) return true;
  const haystack = `${entry.label} ${entry.keywords}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [term, setTerm] = React.useState("");
  const [result, setResult] = React.useState<{ term: string; hits: SearchHit[] }>({
    term: "",
    hits: [],
  });

  const query = term.trim();
  const remote = query.length >= 2;

  // Records live in the database; pages and actions are filtered here.
  React.useEffect(() => {
    if (!remote) return;

    let cancelled = false;
    const id = setTimeout(() => {
      globalSearch(query)
        .then((hits) => {
          if (!cancelled) setResult({ term: query, hits });
        })
        .catch(() => {
          if (!cancelled) setResult({ term: query, hits: [] });
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, remote]);

  // Results belong to the term that produced them, so a stale list never shows.
  const hits = remote && result.term === query ? result.hits : [];
  const searching = remote && result.term !== query;

  function change(next: boolean) {
    if (!next) {
      setTerm("");
      setResult({ term: "", hits: [] });
    }
    onOpenChange(next);
  }

  function go(href: string) {
    change(false);
    router.push(href);
  }

  const actions = ACTIONS.filter((a) => matches(a, query));
  const pages = PAGES.filter((p) => matches(p, query));
  const nothing = hits.length === 0 && actions.length === 0 && pages.length === 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={change}
      label="Search and commands"
      shouldFilter={false}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-2xl"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
        <Command.Input
          value={term}
          onValueChange={setTerm}
          placeholder="Search products, people, invoices — or jump to a page"
          className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
      </div>

      <Command.List className="max-h-[22rem] overflow-y-auto p-2">
        {nothing ? (
          <div className="px-3 py-8 text-center text-sm text-ink-muted">
            {searching ? "Searching…" : `Nothing matches “${query}”.`}
          </div>
        ) : null}

        {GROUPS.map((group) => {
          const items = hits.filter((h) => h.group === group);
          if (items.length === 0) return null;
          return (
            <Command.Group key={group} heading={group} className={GROUP_HEADING}>
              {items.map((h) => (
                <Command.Item
                  key={`${h.group}-${h.id}`}
                  value={`${h.group}-${h.id}`}
                  onSelect={() => go(h.href)}
                  className={`${ITEM} justify-between`}
                >
                  <span className="min-w-0 truncate">{h.label}</span>
                  {h.detail ? (
                    <span className="shrink-0 text-xs text-ink-subtle">{h.detail}</span>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}

        {actions.length > 0 ? (
          <Command.Group heading="Do" className={GROUP_HEADING}>
            {actions.map(({ label, href, icon: Icon }) => (
              <Command.Item key={href} value={`do ${label}`} onSelect={() => go(href)} className={ITEM}>
                <Icon className="size-4 text-ink-subtle" aria-hidden />
                {label}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {pages.length > 0 ? (
          <Command.Group heading="Go to" className={GROUP_HEADING}>
            {pages.map(({ label, href, icon: Icon }) => (
              <Command.Item key={href} value={`go to ${label}`} onSelect={() => go(href)} className={ITEM}>
                <Icon className="size-4 text-ink-subtle" aria-hidden />
                {label}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {searching && hits.length === 0 && !nothing ? (
          <p className="px-3 py-2 text-xs text-ink-subtle">Searching your records…</p>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
