import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getLocale, getMessages } from "next-intl/server";
import { Application } from "@/components/application";
import "@/styles";
import { appearanceBootstrap } from "@/lib/preferences";
import { isSessionCookie } from "@/lib/supabase/config";
export const metadata: Metadata = {
  title: { default: "HealingMuse - A little room to breathe", template: "%s | HealingMuse" },
  description: "Human-curated instrumental music for recreation and emotional support.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "HealingMuse" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3eff7" };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // A returning account is restored in the browser; until then neither guest nor account
  // controls render, so a guest's first HTML keeps its Sign in and an account's never shows it.
  const restoringSession = (await cookies())
    .getAll()
    .some((cookie) => isSessionCookie(cookie.name));
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <Application
          initialLocale={locale}
          initialMessages={messages}
          restoringSession={restoringSession}
        >
          {children}
        </Application>
      </body>
    </html>
  );
}
