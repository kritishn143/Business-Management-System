"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Printing is the browser's job — no PDF pipeline stands between the shop and
 * its printer (SPEC §75). "Save as PDF" lives in that same dialog.
 */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer />
      Print
    </Button>
  );
}
