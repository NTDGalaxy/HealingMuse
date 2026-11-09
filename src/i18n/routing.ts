import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@/lib/routes";
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeDetection: false,
});
