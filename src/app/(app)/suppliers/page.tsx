import type { Metadata } from "next";
import { PartyPage } from "@/features/parties/party-page";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return <PartyPage kind="supplier" />;
}
