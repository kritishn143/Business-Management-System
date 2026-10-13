import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatContextOf } from "@/features/businesses/format-context";
import { loadActiveBusiness } from "@/features/businesses/queries";
import {
  AUDIT_PAGE_SIZE,
  listAuditEvents,
  type AuditEvent,
} from "@/features/audit/queries";
import { changedFields, describeAction, entityLabel, subjectOf } from "@/features/audit/describe";
import { UndoEventButton } from "@/features/audit/undo-button";
import { SettingsSection } from "@/features/settings/section";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Activity" };

const TONE: Record<AuditEvent["action"], "positive" | "caution" | "critical"> = {
  created: "positive",
  updated: "caution",
  deleted: "critical",
};

export default async function ActivityPage({
  searchParams,
}: PageProps<"/settings/activity">) {
  const query = await searchParams;
  const requested = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const page = Number.isInteger(requested) && requested > 1 ? requested : 1;

  const { business, role } = await loadActiveBusiness();
  const ctx = formatContextOf(business);

  // A cashier's policy returns nothing rather than an error, so say why.
  const canRead = role === "owner" || role === "manager" || role === "accountant";
  const { events, total } = canRead
    ? await listAuditEvents({ businessId: business.id, page })
    : { events: [], total: 0 };

  const lastPage = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <SettingsSection
      title="Activity"
      description="Every change to money, stock and access, in the order it happened."
      readOnlyNote={
        canRead
          ? undefined
          : "Only an owner, manager or accountant can read the activity history."
      }
    >
      {canRead && events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing recorded yet"
          description="Sales, purchases, stock movements and staff changes appear here as they happen."
        />
      ) : null}

      {events.length > 0 ? (
        <>
          <ol className="space-y-0 overflow-hidden rounded-xl border border-line bg-surface-raised">
            {events.map((event) => {
              const subject = subjectOf(event);
              const changes = changedFields(event);

              return (
                <li
                  key={event.id}
                  className="border-b border-line px-5 py-4 last:border-0"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Badge tone={TONE[event.action]}>{describeAction(event)}</Badge>
                    <span className="text-sm text-ink">
                      {entityLabel(event.entityType)}
                      {subject ? (
                        <span className="font-medium"> · {subject}</span>
                      ) : null}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[13px] text-ink-subtle">
                      {formatDateTime(event.createdAt, ctx)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] text-ink-muted">
                      by {event.actor}
                      {event.undoable?.undone ? (
                        <span className="ml-2 text-caution">· taken back</span>
                      ) : null}
                    </p>
                    {event.undoable ? (
                      <UndoEventButton
                        movementId={event.undoable.movementId}
                        undone={event.undoable.undone}
                        canUndo={event.undoable.canUndo}
                        isTransfer={event.undoable.isTransfer}
                      />
                    ) : null}
                  </div>

                  {changes.length > 0 ? (
                    <dl className="mt-2 space-y-0.5">
                      {changes.slice(0, 4).map((c) => (
                        <div key={c.field} className="flex flex-wrap gap-x-2 text-[13px]">
                          <dt className="text-ink-subtle">{c.field}</dt>
                          <dd className="text-ink-muted">
                            <span className="line-through">{c.from}</span>
                            <span aria-hidden> → </span>
                            <span className="text-ink">{c.to}</span>
                          </dd>
                        </div>
                      ))}
                      {changes.length > 4 ? (
                        <div className="text-[13px] text-ink-subtle">
                          and {changes.length - 4} more field
                          {changes.length - 4 === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {lastPage > 1 ? (
            <nav
              aria-label="Activity pages"
              className="mt-6 flex items-center justify-between gap-4"
            >
              <p className="text-[13px] text-ink-subtle">
                Page {page} of {lastPage} · {total} event{total === 1 ? "" : "s"}
              </p>
              {/* A disabled anchor is still clickable, so an unavailable
                  direction is simply not rendered as a link. */}
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/settings/activity?page=${page - 1}`}>Newer</Link>
                  </Button>
                ) : null}
                {page < lastPage ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/settings/activity?page=${page + 1}`}>Older</Link>
                  </Button>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      ) : null}

      <p className="mt-6 text-[13px] text-ink-subtle">
        These entries are written by the database itself and cannot be edited or
        deleted by anyone, including an owner. An account entry can be taken back
        or put back here for a week after it was made; after that it can only be
        read.
      </p>
    </SettingsSection>
  );
}
