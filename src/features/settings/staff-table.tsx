"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/data-table/table";
import {
  updateMemberRoleAction,
  updateMemberStatusAction,
  type SettingsFormState,
} from "./actions";
import { ASSIGNABLE_ROLES } from "./schemas";
import type { StaffMember } from "./queries";

const INITIAL: SettingsFormState = {};

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ASSIGNABLE_ROLES.map((r) => [r.value, r.label]),
);

export function StaffTable({
  staff,
  viewerRole,
}: {
  staff: StaffMember[];
  viewerRole: string;
}) {
  const canManage = viewerRole === "owner" || viewerRole === "manager";
  // Only an owner can hand out ownership, and the database enforces it too.
  const roleOptions = ASSIGNABLE_ROLES.filter(
    (r) => r.value !== "owner" || viewerRole === "owner",
  );

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Person</Th>
            <Th>Role</Th>
            <Th>Access</Th>
            {canManage ? <Th className="text-right">Change</Th> : null}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <StaffRow
              key={member.id}
              member={member}
              canManage={canManage}
              viewerRole={viewerRole}
              roleOptions={roleOptions}
            />
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function StaffRow({
  member,
  canManage,
  viewerRole,
  roleOptions,
}: {
  member: StaffMember;
  canManage: boolean;
  viewerRole: string;
  roleOptions: readonly { value: string; label: string }[];
}) {
  const [roleState, roleAction] = useActionState(updateMemberRoleAction, INITIAL);
  const [statusState, statusAction] = useActionState(updateMemberStatusAction, INITIAL);

  // Managers may not touch an owner at all; the trigger refuses it anyway.
  const editable = canManage && !(member.role === "owner" && viewerRole !== "owner");
  const message = roleState.error ?? statusState.error;

  return (
    <Tr>
      <Td>
        <div className="font-medium text-ink">
          {member.name}
          {member.isYou ? (
            <span className="ml-2 text-[13px] font-normal text-ink-subtle">you</span>
          ) : null}
        </div>
        {member.phone ? (
          <div className="text-[13px] text-ink-muted">{member.phone}</div>
        ) : null}
        {message ? (
          <p role="alert" className="mt-1 text-[13px] text-critical">
            {message}
          </p>
        ) : null}
      </Td>

      <Td>
        {editable ? (
          <form action={roleAction}>
            <input type="hidden" name="memberId" value={member.id} />
            <RoleSelect current={member.role} options={roleOptions} />
          </form>
        ) : (
          <span className="text-ink-muted">{ROLE_LABELS[member.role] ?? member.role}</span>
        )}
      </Td>

      <Td>
        {member.status === "active" ? (
          <Badge tone="positive">Active</Badge>
        ) : member.status === "invited" ? (
          <Badge tone="caution">Invited</Badge>
        ) : (
          <Badge tone="neutral">Suspended</Badge>
        )}
      </Td>

      {canManage ? (
        <Td className="text-right">
          {editable && !member.isYou ? (
            <form action={statusAction} className="inline-flex">
              <input type="hidden" name="memberId" value={member.id} />
              <input
                type="hidden"
                name="status"
                value={member.status === "active" ? "suspended" : "active"}
              />
              <StatusButton active={member.status === "active"} />
            </form>
          ) : (
            <span className="text-[13px] text-ink-subtle">—</span>
          )}
        </Td>
      ) : null}
    </Tr>
  );
}

/** Changing the select is the whole intent, so it submits itself. */
function RoleSelect({
  current,
  options,
}: {
  current: string;
  options: readonly { value: string; label: string }[];
}) {
  const { pending } = useFormStatus();

  return (
    <Select
      name="role"
      defaultValue={current}
      disabled={pending}
      aria-label="Role"
      className="h-9 w-48"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function StatusButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={active ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
    >
      {pending ? "Saving…" : active ? "Suspend" : "Restore"}
    </Button>
  );
}
