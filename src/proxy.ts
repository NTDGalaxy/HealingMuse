import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { isConfigured, supabaseKey, supabaseUrl } from "./lib/supabase/config";
import { serverFetch } from "./lib/server/transport";

const internationalize = createMiddleware(routing);
export async function proxy(request: NextRequest) {
  const pendingCookies: {
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }[] = [];
  if (isConfigured) {
    const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
      global: { fetch: serverFetch },
      db: { retry: false, timeout: 5000 },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          pendingCookies.push(...values);
        },
      },
    });
    // Signature verification refreshes cookies; authorization is repeated in handlers.
    await supabase.auth.getClaims().catch(() => {
      console.warn(JSON.stringify({ event: "authentication_failed" }));
    });
  }
  // Build the routing response after cookie refresh so server components receive the new request cookies.
  const response = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.next({ request: { headers: request.headers } })
    : internationalize(request);
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next|offline|sw.js|manifest.webmanifest|icons|art|fonts|favicon.ico|.*\\..*).*)",
  ],
};
