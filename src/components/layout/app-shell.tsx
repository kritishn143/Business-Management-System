"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { BusinessSwitcher, type BusinessSummary } from "./business-switcher";
import { SyncIndicator } from "./sync-indicator";
import { SearchTrigger } from "./search-trigger";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function SidebarBody({ businesses, activeBusinessId, onNavigate }: {
  businesses: BusinessSummary[];
  activeBusinessId?: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" onClick={onNavigate}>
          <Wordmark />
        </Link>
      </div>
      <BusinessSwitcher businesses={businesses} activeId={activeBusinessId} />
      <div className="mt-6 flex-1 overflow-y-auto pb-6">
        <SidebarNav onNavigate={onNavigate} />
      </div>
    </>
  );
}

export function AppShell({
  children,
  businesses,
  activeBusinessId,
  user,
}: {
  children: React.ReactNode;
  businesses: BusinessSummary[];
  activeBusinessId?: string;
  user: { id: string; name: string; email: string };
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    // The sync engine lives above the whole app: a queued sale must keep
    // draining wherever the cashier navigates (SPEC §50).
    <SyncProvider actorId={user.id}>
      <div className="flex min-h-svh bg-canvas">
        {/* Persistent on desktop (SPEC §55) */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex print:hidden">
          <SidebarBody businesses={businesses} activeBusinessId={activeBusinessId} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6 print:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody
                  businesses={businesses}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <div className="flex flex-1 justify-center lg:justify-start">
              <SearchTrigger />
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <SyncIndicator />
              <ThemeToggle />
              <UserMenu name={user.name} email={user.email} />
            </div>
          </header>

          {/* Printing drops the chrome and the page padding: paper has its own margins. */}
          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10 print:p-0">{children}</main>
        </div>
      </div>
    </SyncProvider>
  );
}
