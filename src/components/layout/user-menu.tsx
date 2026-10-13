"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
        aria-label="Account menu"
      >
        <Avatar>
          <AvatarFallback>{initials(name) || <UserIcon className="size-4" />}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-ink">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs font-normal text-ink-subtle">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
