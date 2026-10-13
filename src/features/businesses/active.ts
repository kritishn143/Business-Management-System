import { cookies } from "next/headers";

/**
 * Which business the user is working in.
 *
 * Held in a cookie rather than the URL: every screen is scoped to one shop, and
 * threading it through every route would make each of them ambiguous. The
 * cookie is only ever a *preference* — membership is checked against the
 * database before it is honoured, so a forged value selects nothing (SPEC §44).
 */
const COOKIE = "bms.business";

export async function readActiveBusinessId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function writeActiveBusinessId(businessId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Puts the chosen business first, which is how the rest of the app learns
 * which one is active. Pure, because getting this wrong would show one shop's
 * figures under another's name.
 *
 * A choice that matches nothing is ignored rather than honoured: the cookie is
 * a preference, and the list it is applied to has already been filtered by the
 * database to memberships the user actually holds.
 */
export function orderByActive<T extends { business: { id: string } }>(
  memberships: T[],
  chosenId: string | null,
): T[] {
  if (!chosenId) return memberships;

  const index = memberships.findIndex((m) => m.business.id === chosenId);
  if (index <= 0) return memberships;

  return [memberships[index], ...memberships.filter((_, i) => i !== index)];
}
