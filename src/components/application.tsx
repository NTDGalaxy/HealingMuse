"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { Locale } from "@/lib/types";
import { AppProvider } from "./app-state";
import { PlayerProvider } from "./player";
import { Shell } from "./shell";
import { BinauralProvider } from "./binaural-provider";
import { AppearanceProvider } from "./appearance";
export function Application({
  initialMessages,
  initialLocale,
  children,
}: {
  initialMessages: AbstractIntlMessages;
  initialLocale: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [translation, setTranslation] = useState({
    locale: initialLocale,
    messages: initialMessages,
  });
  const locale: Locale = pathname?.startsWith("/en")
    ? "en"
    : pathname?.startsWith("/vi")
      ? "vi"
      : initialLocale === "en"
        ? "en"
        : "vi";
  useEffect(() => {
    document.documentElement.lang = locale;
    let active = true;
    if (translation.locale !== locale) {
      const pending = locale === "vi" ? import("@/messages/vi.json") : import("@/messages/en.json");
      void pending.then((module) => {
        if (active) setTranslation({ locale, messages: module.default });
      });
    }
    return () => {
      active = false;
    };
  }, [locale, translation.locale]);
  return (
    <NextIntlClientProvider
      locale={translation.locale}
      messages={translation.messages}
      timeZone="Asia/Ho_Chi_Minh"
    >
      <AppearanceProvider>
        <AppProvider tracks={[]} collections={[]}>
          <PlayerProvider>
            <BinauralProvider>
              <Shell>{children}</Shell>
            </BinauralProvider>
          </PlayerProvider>
        </AppProvider>
      </AppearanceProvider>
    </NextIntlClientProvider>
  );
}
