import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatContextOf } from "@/features/businesses/format-context";
import { listMemberships } from "@/features/businesses/queries";
import { listPosCustomers } from "@/features/sales/actions";
import { createClient } from "@/lib/supabase/server";
import { PosTerminal } from "@/features/sales/pos-terminal";

export const metadata: Metadata = { title: "New sale" };

export default async function NewSalePage() {
  const supabase = await createClient();
  const [memberships, customers, session] = await Promise.all([
    listMemberships(),
    listPosCustomers(),
    supabase.auth.getUser(),
  ]);
  const ctx = formatContextOf(memberships[0].business);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/sales"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Sales
      </Link>

      <h1 className="mt-4 mb-6 text-[28px] font-semibold tracking-tight text-ink">
        New sale
      </h1>

      {/* The cashier is stamped on anything queued offline, so a shared till
          never files one person's sale under another's name. */}
      <PosTerminal
        ctx={ctx}
        customers={customers}
        actorId={session.data.user?.id ?? null}
      />
    </div>
  );
}
