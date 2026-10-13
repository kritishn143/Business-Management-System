import { NextResponse } from "next/server";
import { isExportKey, loadExport, EXPORTS } from "@/features/data/exports";
import { loadActiveBusiness } from "@/features/businesses/queries";
import { createClient } from "@/lib/supabase/server";
import { localCalendarDate } from "@/lib/format";

/**
 * Downloads one table as CSV. Route handlers sit outside the app layout, so
 * this checks the session itself rather than assuming one (SPEC §44).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/export/[entity]">,
) {
  const { entity } = await params;

  if (!isExportKey(entity)) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  }

  const { business } = await loadActiveBusiness();
  const csv = await loadExport(entity);

  const today = localCalendarDate(new Date().toISOString(), business.timezone);
  const filename = `${business.slug}-${entity}-${today}.csv`;

  // A byte order mark is what makes Excel read UTF-8 rather than guessing at
  // it; our own parser strips it again on import.
  return new NextResponse(`\ufeff${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-export-label": EXPORTS[entity].label,
    },
  });
}
