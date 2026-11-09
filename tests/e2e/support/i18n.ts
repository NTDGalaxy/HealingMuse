import { readFileSync } from "node:fs";
import { createTranslator, type MessageKeys, type NestedKeyOf } from "next-intl";
import type english from "../../../src/messages/en.json";

// Specs match interface copy through the application's own message files and
// next-intl's ICU formatter, so rewriting copy never requires editing a spec.
type Messages = typeof english;

export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;
export type MessageValues = Record<string, string | number>;

function translator(locale: Locale) {
  const messages = JSON.parse(
    readFileSync(new URL(`../../../src/messages/${locale}.json`, import.meta.url), "utf8"),
  ) as Messages;
  return createTranslator({
    locale,
    messages,
    timeZone: "Asia/Ho_Chi_Minh",
    // A renamed key or a missing ICU value must fail loudly instead of matching a fallback.
    onError(error) {
      throw error;
    },
  });
}

const translators = { en: translator("en"), vi: translator("vi") };

/** The exact text the application renders for a message, formatted as next-intl formats it. */
export function t(locale: Locale, key: MessageKey, values?: MessageValues): string {
  return translators[locale](key, values);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A pattern that matches a message anywhere inside a longer accessible name or text. */
export function pattern(locale: Locale, key: MessageKey, values?: MessageValues): RegExp {
  return new RegExp(escapeRegExp(t(locale, key, values)));
}

/** A pattern that matches an element whose whole text is the message, for `hasText` filters. */
export function wholePattern(locale: Locale, key: MessageKey, values?: MessageValues): RegExp {
  return new RegExp(`^${escapeRegExp(t(locale, key, values))}$`);
}

/** Accessible names that components compose from a message and a recording or playlist title. */
export const composed = {
  recordingDetails: (locale: Locale, title: string) => `${t(locale, "catalog.details")}: ${title}`,
  editRecording: (locale: Locale, title: string) => `${t(locale, "admin.edit")}: ${title}`,
  listenToPlaylist: (locale: Locale, title: string) =>
    `${t(locale, "library.listenPlaylist")}: ${title}`,
  removeDownload: (locale: Locale, title: string) => `${t(locale, "common.remove")}: ${title}`,
};
