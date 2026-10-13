import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FormAlert } from "@/features/auth/form-parts";

/** Shell every settings subpage shares: a way back, a title, one card. */
export function SettingsSection({
  title,
  description,
  readOnlyNote,
  children,
}: {
  title: string;
  description: string;
  readOnlyNote?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Settings
      </Link>

      <div className="mt-4">
        <PageHeader title={title} description={description} />
      </div>

      {readOnlyNote ? (
        <div className="mb-5">
          <FormAlert tone="critical">{readOnlyNote}</FormAlert>
        </div>
      ) : null}

      {children}
    </div>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6">
      {children}
    </div>
  );
}
