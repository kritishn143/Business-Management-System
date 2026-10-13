import type { Metadata } from "next";
import { PartyDetail } from "@/features/parties/party-detail";
import { getParty } from "@/features/parties/queries";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const party = await getParty(id);
  return { title: party?.name ?? "Customer" };
}

export default async function CustomerDetailPage({
  params,
}: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <PartyDetail id={id} kind="customer" />;
}
