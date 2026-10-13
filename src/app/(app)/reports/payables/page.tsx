import type { Metadata } from "next";
import { AgeingReportPage } from "@/features/reports/ageing-report";

export const metadata: Metadata = { title: "Payables" };

export default function PayablesReportPage() {
  return <AgeingReportPage kind="payable" />;
}
