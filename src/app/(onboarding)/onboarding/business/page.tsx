import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateBusinessForm } from "@/features/businesses/create-business-form";
import { listMemberships } from "@/features/businesses/queries";

export const metadata: Metadata = { title: "Set up your shop" };

export default async function OnboardingBusinessPage() {
  // Someone who already has a shop has no business here.
  const memberships = await listMemberships();
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-wide text-accent">
        Step 1 of 1
      </p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">
        Set up your shop
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">
        This takes a minute. You can change any of it later in Settings.
      </p>

      <CreateBusinessForm />
    </div>
  );
}
