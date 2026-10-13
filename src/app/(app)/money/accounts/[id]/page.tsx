import { redirect } from "next/navigation";

/** Accounts are browsed side by side now; keep older links working. */
export default async function AccountRedirect({
  params,
}: PageProps<"/money/accounts/[id]">) {
  const { id } = await params;
  redirect(`/accounts?account=${id}`);
}
