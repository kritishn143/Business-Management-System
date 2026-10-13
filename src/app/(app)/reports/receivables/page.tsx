import type { Metadata } from "next";
import { AgeingReportPage } from "@/features/reports/ageing-report";

export const metadata: Metadata = { title: "Receivables" };

export default function ReceivablesReportPage() {
  return <AgeingReportPage kind="receivable" />;
}
