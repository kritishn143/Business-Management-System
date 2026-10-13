import type { Metadata } from "next";
import { ReturnsPage } from "@/features/returns/returns-page";

export const metadata: Metadata = { title: "Purchase returns" };

export default function PurchaseReturnsPage() {
  return <ReturnsPage kind="purchase" />;
}
