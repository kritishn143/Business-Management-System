import type { Metadata } from "next";
import { PartyPage } from "@/features/parties/party-page";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <PartyPage kind="customer" />;
}
