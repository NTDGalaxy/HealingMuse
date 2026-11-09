export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * The name of Supabase's session cookie and of the channel it tells other tabs about sign-in on:
 * supabase-js's default storage key for the project URL (tests/unit/supabase-config.test.ts pins
 * the two together). Null when sign-in is not configured.
 */
export function authStorageKey(url = isConfigured ? supabaseUrl : undefined): string | null {
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}
