import type { FormatContext } from "@/lib/format";
import { listMemberships, type MembershipSummary } from "./queries";

/**
 * Builds the formatting context from the active business, so currency,
 * timezone and calendar come from the shop's own settings rather than being
 * re-specified (and drifting) on every page.
 */
export function formatContextOf(
  business: MembershipSummary["business"],
): FormatContext {
  return {
    currency_code: business.currency_code,
    currency_position: business.currency_position,
    number_format: business.number_format,
    date_format: business.date_format,
    timezone: business.timezone,
    date_system: business.date_system,
  };
}

/** Convenience for pages that only need the context. */
export async function loadFormatContext(): Promise<FormatContext> {
  const memberships = await listMemberships();
  return formatContextOf(memberships[0].business);
}
