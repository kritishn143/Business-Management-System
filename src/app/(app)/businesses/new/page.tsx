import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CreateBusinessForm } from "@/features/businesses/create-business-form";

export const metadata: Metadata = { title: "Add a business" };

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Add a business"
          description="A second shop keeps its own products, customers and books. Nothing is shared between them."
        />
      </div>

      <CreateBusinessForm />

      <p className="mt-6 text-[13px] text-ink-subtle">
        You will be switched to the new business once it is created. Use the
        selector at the top of the sidebar to move between them.
      </p>
    </div>
  );
}
