import type { Metadata } from "next";
import { ReturnsPage } from "@/features/returns/returns-page";

export const metadata: Metadata = { title: "Sales returns" };

export default function SalesReturnsPage() {
  return <ReturnsPage kind="sale" />;
}
