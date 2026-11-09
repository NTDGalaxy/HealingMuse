import type { Metadata, Viewport } from "next";
import { getLocale, getMessages } from "next-intl/server";
import { Application } from "@/components/application";
import "@/styles";
import { appearanceBootstrap } from "@/components/appearance";
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
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <Application initialLocale={locale} initialMessages={messages}>
          {children}
        </Application>
      </body>
    </html>
  );
}
