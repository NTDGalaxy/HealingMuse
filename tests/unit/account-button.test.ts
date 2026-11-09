import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../src/messages/en.json";

// The first render (on the server, and again while the browser hydrates) is decided before any
// Supabase code runs, from whether the request carried a session cookie.
vi.mock("@/lib/supabase/config", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/config")>()),
  isConfigured: true,
  authStorageKey: () => "sb-synthetic-auth-token",
}));

const { AppearanceProvider } = await import("../../src/components/appearance");
const { AppProvider } = await import("../../src/components/app-state");
const { AccountButton } = await import("../../src/components/shell-runtime");

function header(restoringSession: boolean) {
  return renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Ho_Chi_Minh",
      children: h(AppearanceProvider, {
        children: h(AppProvider, {
          tracks: [],
          collections: [],
          restoringSession,
          children: h(AccountButton),
        }),
      }),
    }),
  );
}

describe("header account control", () => {
  it("offers a guest Sign in from the first render", () => {
    expect(header(false)).toMatch(/^<button class="account-button">Sign in<svg /);
  });
  it("offers neither Sign in nor Account while a returning account is restored", () => {
    expect(header(true)).toBe("");
  });
});
