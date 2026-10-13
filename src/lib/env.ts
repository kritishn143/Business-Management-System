import { z } from "zod";

/**
 * Fail loudly at boot rather than with an opaque runtime error later.
 * Only NEXT_PUBLIC_* values belong here — the service-role key and the
 * Postgres password are never read from shared code (SPEC §53).
 *
 * Supabase is renaming `anon` keys to `publishable` keys (sb_publishable_…);
 * both env var names are accepted so the project works either way.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://xyz.supabase.co",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message:
      "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | null = null;

// Next.js inlines NEXT_PUBLIC_* only on literal property access, so these
// cannot be read dynamically from process.env.
function rawKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function publicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: rawKey(),
  });

  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(
      `Supabase environment is not configured. ${detail}. Copy .env.example to .env.local and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(rawKey());
}
