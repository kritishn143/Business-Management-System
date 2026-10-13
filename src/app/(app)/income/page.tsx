import type { Metadata } from "next";
import { MoneyPage } from "@/features/money/money-page";

export const metadata: Metadata = { title: "Other income" };

export default function IncomePage() {
  return <MoneyPage kind="income" />;
}
