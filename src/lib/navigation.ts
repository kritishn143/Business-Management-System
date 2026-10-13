import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Boxes,
  ChartNoAxesColumn,
  LayoutGrid,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marks routes whose feature work lands in a later milestone. */
  ready?: boolean;
};

/**
 * One flat list, nine destinations (SPEC §5). Deliberately shallow: no
 * expandable trees, no category headings competing with the content.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, ready: true },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/reports", label: "Reports", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const QUICK_ACTIONS: NavItem[] = [
  { href: "/sales/new", label: "New sale", icon: Receipt },
  { href: "/inventory/products/new", label: "Add product", icon: Boxes },
  { href: "/purchases/new", label: "Record purchase", icon: ShoppingCart },
  { href: "/payments", label: "Record payment", icon: ArrowLeftRight },
];

export function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
