export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * The name of Supabase's session cookie and of the channel it tells other tabs about sign-in on:
 * supabase-js's default storage key for the project URL (tests/unit/supabase-config.test.ts pins
 * the two together). Null when sign-in is not configured.
 */
/**
 * Whether a cookie is Supabase's session cookie for this project: the whole session, or one of
 * the numbered chunks (key.0, key.1 and so on) a large session is split into.
 */
export function isSessionCookie(name: string, storageKey = authStorageKey()): boolean {
  if (!storageKey) return false;
  return (
    name === storageKey ||
    (name.startsWith(`${storageKey}.`) && /^\d+$/.test(name.slice(storageKey.length + 1)))
  );
}

export function authStorageKey(url = isConfigured ? supabaseUrl : undefined): string | null {
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}
