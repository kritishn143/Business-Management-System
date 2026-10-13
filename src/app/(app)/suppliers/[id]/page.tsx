import type { Metadata } from "next";
import { PartyDetail } from "@/features/parties/party-detail";
import { getParty } from "@/features/parties/queries";

export async function generateMetadata({
  params,
}: PageProps<"/suppliers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const party = await getParty(id);
  return { title: party?.name ?? "Supplier" };
}

export default async function SupplierDetailPage({
  params,
}: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  return <PartyDetail id={id} kind="supplier" />;
}
