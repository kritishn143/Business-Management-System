import type { Metadata } from "next";
import { MoneyPage } from "@/features/money/money-page";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return <MoneyPage kind="expense" />;
}
