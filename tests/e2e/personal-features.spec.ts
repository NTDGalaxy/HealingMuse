import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { PersonalData, Track } from "@/lib/types";
import AxeBuilder from "@axe-core/playwright";
import { paginateTracks } from "../../src/lib/catalog-query";
let server: ViteDevServer;
let origin: string;
test.afterAll(async () => {
  await server?.close();
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/releases", (route) => route.fulfill({ json: { items: [] } }));
});
const owner = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { host: "127.0.0.1", port: 0 },
    resolve: {
      alias: [
        { find: "@/lib/supabase/client", replacement: resolve("tests/browser-fixtures/auth.ts") },
        { find: "next/link", replacement: resolve("tests/browser-fixtures/link.tsx") },
        { find: "next/navigation", replacement: resolve("tests/browser-fixtures/navigation.ts") },
        { find: "@", replacement: resolve("src") },
      ],
    },
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://synthetic.invalid"),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("synthetic-key"),
    },
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0];
});
test("password sign-in is the default and does not send an email", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
        favorites: [],
        playlists: [],
        checkins: [],
        isAdmin: true,
      },
    }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest`);
  await page.getByRole("navigation").getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await dialog.getByLabel("Email address", { exact: true }).fill("synthetic@example.invalid");
  await dialog.getByLabel("Password", { exact: true }).fill("wrong password");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("email or password");
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog.getByLabel("Password", { exact: true }).fill("synthetic password only");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual([
    "signInWithPassword",
    "signInWithPassword",
  ]);
});
for (const locale of ["en", "vi"] as const) {
  test(`password controls are accessible and clear credentials on close in ${locale}`, async ({
    page,
  }) => {
    const messages = JSON.parse(await readFile(`src/messages/${locale}.json`, "utf8"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}tests/browser-fixtures/index.html?guest&locale=${locale}`);
    const trigger = page
      .getByRole("navigation")
      .getByRole("button", { name: "Sign in", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const password = dialog.getByLabel(messages.auth.password, { exact: true });
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(dialog.getByLabel(messages.auth.email, { exact: true })).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await password.fill("synthetic password only");
    const show = dialog.getByRole("button", { name: messages.auth.showPassword, exact: true });
    const bounds = await show.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    await dialog.getByRole("button", { name: messages.auth.hidePassword, exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    for (let tab = 0; tab < 14; tab++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/password-sign-in-${locale}-phone.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(password).toHaveValue("");
    await expect(password).toHaveAttribute("type", "password");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
test("password and email limits are announced separately without automatic retries", async ({
  page,
}) => {
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest&request-limit`);
  await page.getByRole("navigation").getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address", { exact: true }).fill("synthetic@example.invalid");
  await dialog.getByLabel("Password", { exact: true }).fill("synthetic password only");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Too many sign-in requests");
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual(["signInWithPassword"]);
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest&email-limit`);
  await page.getByRole("navigation").getByRole("button", { name: "Sign in", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Forgot or need to set a password?", exact: true })
    .click();
  await expect(dialog.getByLabel("Email address", { exact: true })).toBeFocused();
  await dialog.getByLabel("Email address", { exact: true }).fill("synthetic@example.invalid");
  await dialog.getByRole("button", { name: "Send password recovery email", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("email sending limit");
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual(["resetPasswordForEmail"]);
});
test("recovery preserves the current origin and locale and gives a private confirmation", async ({
  page,
}) => {
  const messages = JSON.parse(await readFile("src/messages/vi.json", "utf8"));
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest&locale=vi`);
  await page.getByRole("navigation").getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: messages.auth.forgotPassword, exact: true }).click();
  await dialog.getByLabel(messages.auth.email, { exact: true }).fill("synthetic@example.invalid");
  await dialog.getByRole("button", { name: messages.auth.sendRecovery, exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(messages.auth.recoverySent);
  await expect(dialog.getByRole("status")).toBeFocused();
  expect(await page.evaluate(() => window.__syntheticRecoveryPath)).toBe("/vi/reset-password");
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual(["resetPasswordForEmail"]);
});
test("password updates require a session, validate confirmation and clear the saved password", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
        favorites: [],
        playlists: [],
        checkins: [],
        isAdmin: false,
      },
    }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest`);
  await page.getByRole("button", { name: "password", exact: true }).click();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual([]);
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "password", exact: true }).click();
  await page.getByLabel("New password", { exact: true }).fill("synthetic password only");
  await page.getByLabel("Confirm new password", { exact: true }).fill("another synthetic password");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");
  await expect(page.getByLabel("Confirm new password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual([]);
  await page.getByLabel("Confirm new password", { exact: true }).fill("synthetic password only");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("password has been saved");
  await expect(page.getByRole("status")).toBeFocused();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual(["updateUser"]);
});
test("server password-policy failures are announced on the new password field", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
        favorites: [],
        playlists: [],
        checkins: [],
        isAdmin: false,
      },
    }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html?password-update-error`);
  await page.getByRole("button", { name: "password", exact: true }).click();
  await page.getByLabel("New password", { exact: true }).fill("synthetic password only");
  await page.getByLabel("Confirm new password", { exact: true }).fill("synthetic password only");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not save");
  await expect(page.getByLabel("New password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("New password", { exact: true })).toHaveAttribute(
    "aria-describedby",
    "password-help password-error",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => window.__syntheticAuthCalls)).toEqual(["updateUser"]);
});
test("named release review checks delivery, records confirmations and reports a changed manifest", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: true,
  };
  const release = {
    id,
    title: "Synthetic release",
    manifestHash: "a".repeat(64),
    expectedCount: 1000,
    matchingCount: 1000,
    deliveredCount: 999,
    publishedAt: null as string | null,
    reviewerName: null as string | null,
  };
  let changed = true;
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route("**/api/admin/tracks*", (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/releases", (route) =>
    route.fulfill({ json: { items: [release] } }),
  );
  await page.route("**/api/admin/releases/publish", (route) => {
    const submission = route.request().postDataJSON();
    submissions.push(submission);
    if (changed) return route.fulfill({ status: 409, json: { error: { code: "conflict" } } });
    release.publishedAt = new Date().toISOString();
    release.reviewerName = submission.reviewerName;
    return route.fulfill({ json: { id, count: 1000, repeated: false } });
  });
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "admin", exact: true }).click();
  const publish = page.getByRole("button", { name: "Attest and publish 1000 recordings" });
  await expect(publish).toBeDisabled();
  release.deliveredCount = 1000;
  await page.getByRole("button", { name: "library", exact: true }).click();
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await expect(publish).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Reviewer’s full name" })
    .fill("Synthetic human reviewer");
  await publish.click();
  expect(submissions).toHaveLength(0);
  for (const name of [
    "I listened to every recording in this manifest and completed the listening review.",
    "I verified the rights and attribution for every recording in this manifest.",
    "I verified that every recording has documented provenance and was created by humans.",
  ])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await publish.click();
  await expect(page.getByRole("alert")).toContainText(
    "The manifest, metadata or delivery changed.",
  );
  expect(submissions[0]).toMatchObject({
    releaseId: id,
    manifestHash: release.manifestHash,
    listeningConfirmed: true,
    rightsConfirmed: true,
    provenanceConfirmed: true,
    attestationVersion: "human-review-v1",
  });
  expect(submissions[0]).not.toHaveProperty("reviewerId");
  changed = false;
  await publish.click();
  await expect(page.locator('.release-review [role="status"]')).toContainText(
    "Published with attestation by Synthetic human reviewer.",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("synthetic accounts manage a library, paired check-ins, erasure, and sign-out", async ({
  page,
}) => {
  const A = "00000000-0000-4000-8000-000000000001",
    B = "00000000-0000-4000-8000-000000000002",
    session = "30000000-0000-4000-8000-000000000001";
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: false,
  };
  await page.route("**/api/me", (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const change = route.request().postDataJSON();
      if (change.moodConsent !== undefined) {
        data.profile.mood_consent_at = change.moodConsent ? new Date().toISOString() : null;
        if (!change.moodConsent) data.checkins = [];
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (method === "DELETE") {
      data.checkins = [];
      data.playlists = [];
      data.favorites = [];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: data });
  });
  await page.route("**/api/playlists", (route) => {
    data.playlists.push({
      id,
      title: route.request().postDataJSON().title,
      revision: 0,
      trackIds: [],
    });
    return route.fulfill({ json: { id } });
  });
  await page.route(`**/api/playlists/${id}`, (route) => {
    if (route.request().method() === "DELETE") data.playlists = [];
    else {
      const input = route.request().postDataJSON();
      data.playlists = [
        { id, title: input.title, revision: input.revision + 1, trackIds: input.trackIds },
      ];
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/favorites", (route) => {
    const input = route.request().postDataJSON();
    data.favorites = input.saved ? [input.trackId] : [];
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/sessions", (route) => {
    const input = route.request().postDataJSON();
    const method = route.request().method();
    if (method === "DELETE") data.checkins = [];
    else if (input.beforeScore || input.afterScore)
      data.checkins.push({
        id: crypto.randomUUID(),
        session_id: session,
        phase: method === "POST" ? "before" : "after",
        score: input.beforeScore ?? input.afterScore,
        created_at: new Date().toISOString(),
      });
    return route.fulfill({ json: { id: session } });
  });
  const prepared = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
  const audio = await readFile(`media/prepared/${prepared.source.path}`);
  await page.route("**/api/grants/*", (route) =>
    route.fulfill({
      json: { url: "/fixture.mp3", expiresAt: new Date(Date.now() + 600000).toISOString() },
    }),
  );
  await page.route("**/fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "Create a playlist", exact: true }).click();
  await page.getByRole("textbox", { name: "Playlist name" }).fill("Evening");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "recording", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Synthetic recording to favorites", exact: true })
    .click();
  for (const title of ["Synthetic recording", "Second synthetic recording"]) {
    await page.getByRole("button", { name: `Recording details: ${title}`, exact: true }).click();
    await page.getByRole("button", { name: "Add to playlist", exact: true }).click();
    await page.getByRole("button", { name: "Evening", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "library", exact: true }).click();
  await page.getByRole("button", { name: "Edit playlist", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Second synthetic recording up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(data.playlists[0].trackIds).toEqual([B, A]);
  await page.getByRole("button", { name: "mood", exact: true }).click();
  await page.getByRole("button", { name: "Enable private check-ins", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your last seven days", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "recording", exact: true }).click();
  await page.getByRole("button", { name: "Listen to Synthetic recording", exact: true }).click();
  await page.getByRole("radio", { name: "Low", exact: true }).check();
  await page.getByRole("button", { name: "Save and listen", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
  await expect.poll(() => data.checkins.length).toBe(1);
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await page.getByRole("radio", { name: "Good", exact: true }).check();
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data.checkins.map((item) => item.phase)).toEqual(["before", "after"]);
  await page.getByRole("button", { name: "mood", exact: true }).click();
  await page.getByRole("button", { name: "Delete mood history", exact: true }).hover();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".button.secondary.danger")
        .withRules(["color-contrast"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Delete mood history", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete mood history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your story doesn't need a score", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await page.getByRole("button", { name: "Delete my account", exact: true }).click();
  await page.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete account", exact: true }).click();
  await expect(
    page.getByText(
      "You're listening as a guest. Sign in to save a private library across devices.",
      { exact: true },
    ),
  ).toBeVisible();
});
test.afterAll(async () => {
  await server?.close();
});
test("a conflicting playlist edit shows the latest version before another save", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [{ id, title: "Original playlist", revision: 0, trackIds: [] }],
    checkins: [],
    isAdmin: false,
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  let attempts = 0;
  await page.route(`**/api/playlists/${id}`, (route) => {
    attempts++;
    if (attempts === 1) {
      data.playlists = [{ id, title: "Changed on another device", revision: 1, trackIds: [] }];
      return route.fulfill({ status: 409, json: { error: { code: "conflict" } } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "Edit playlist", exact: true }).click();
  await page.getByRole("textbox", { name: "Playlist name" }).fill("My conflicting edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Playlist name" })).toHaveValue(
    "Changed on another device",
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("changed");
});
test("synthetic authentication, consent, personal history, and administration forms are accessible", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: true,
  };
  await page.route("**/api/me", async (route) => {
    if (route.request().method() === "PATCH") {
      const change = route.request().postDataJSON();
      if (change.moodConsent !== undefined)
        data.profile.mood_consent_at = change.moodConsent ? new Date().toISOString() : null;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: data });
  });
  await page.route("**/api/admin/tracks*", (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
  await page.goto(`${origin}tests/browser-fixtures/index.html?guest`);
  await page
    .getByRole("navigation", { name: "Fixture screens" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("synthetic@example.invalid");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Use an email code instead", exact: true }).click();
  await page.getByRole("button", { name: "Email me a sign-in code", exact: true }).click();
  await page.getByRole("textbox", { name: "Sign-in code", exact: true }).fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Sign-in code", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "Sign-in code", exact: true })).toHaveAttribute(
    "aria-describedby",
    "code-help auth-error",
  );
  await page.getByRole("textbox", { name: "Sign-in code", exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "mood", exact: true }).click();
  await page.getByRole("button", { name: "Enable private check-ins", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your last seven days", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Add a recording", exact: true }).click();
  await expect(page.getByLabel("English description", { exact: true })).toHaveAttribute(
    "maxlength",
    "600",
  );
  await expect(page.getByLabel("Duration in seconds", { exact: true })).toHaveAttribute(
    "max",
    "14400",
  );
  await expect(page.locator('#admin-color option[value="sage"]')).toHaveText("Sage green");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("content publication requires review and supports retirement", async ({ page }) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: true,
  };
  const tracks: unknown[] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/tracks*", (route) => {
    if (route.request().method() === "POST") {
      const row = route.request().postDataJSON();
      tracks.splice(0, tracks.length, row);
      return route.fulfill({ json: { id: row.id } });
    }
    return route.fulfill({ json: { items: tracks, total: tracks.length, nextCursor: null } });
  });
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Add a recording", exact: true }).click();
  for (const [label, value] of [
    ["Vietnamese title", "Bản thu thử"],
    ["English title", "Synthetic studio recording"],
    ["Vietnamese description", "Dữ liệu thử nghiệm"],
    ["English description", "Synthetic fixture only"],
    ["Creator or performer", "Synthetic fixture"],
    ["Full attribution", "Synthetic fixture only"],
    ["License name", "CC0"],
    ["Recording provenance URL", "https://example.invalid/fixture"],
    ["Storage path, video ID, or Spotify URL", "synthetic.mp3"],
  ])
    await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page.getByLabel("Publication status", { exact: true }).selectOption("published");
  await page.getByRole("button", { name: "Save recording", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Review all required fields");
  expect(tracks).toHaveLength(0);
  await page
    .getByRole("checkbox", {
      name: "I reviewed distribution rights and attribution.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "I verified this is a human-created or human-recorded work",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "I have listened to this recording and approved its content for publication.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save recording", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".status-pill")).toHaveText("Published");
  await page
    .getByRole("button", { name: "Edit recording: Synthetic studio recording", exact: true })
    .click();
  await page.getByRole("button", { name: "Reject recording", exact: true }).click();
  await expect(page.locator(".status-pill")).toHaveText("Retired");
});
for (const locale of ["vi", "en"] as const)
  test(`signed-in ${locale} screens and mood choices reflow at three sizes`, async ({ page }) => {
    const data: PersonalData = {
      profile: { id: owner, locale, calm_mode: false, mood_consent_at: new Date().toISOString() },
      favorites: ["00000000-0000-4000-8000-000000000001"],
      playlists: [],
      checkins: [],
      isAdmin: true,
    };
    await page.route("**/api/me", (route) => route.fulfill({ json: data }));
    await page.route("**/api/admin/tracks*", (route) =>
      route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
    );
    await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
    await page.goto(`${origin}tests/browser-fixtures/index.html?locale=${locale}`);
    await page.getByRole("button", { name: "mood", exact: true }).click();
    await expect(page.locator(".mood-trends")).toBeVisible();
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["library", "mood", "settings", "admin"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: `artifacts/design/${view}-${locale}-${width}.png`,
          fullPage: true,
        });
      }
      await page.getByRole("button", { name: "recording", exact: true }).click();
      await page
        .getByRole("button", {
          name: locale === "vi" ? "Nghe Bản thu thử" : "Listen to Synthetic recording",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("radio")).toHaveCount(5);
      await page.screenshot({ path: `artifacts/design/checkin-${locale}-${width}.png` });
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      for (const label of await dialog.locator(".mood-scores label").all()) {
        expect(
          await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ).toBeGreaterThanOrEqual(16);
        expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Escape");
    }
  });
test("Vietnamese content forms use translated options across phone, tablet, and desktop", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "vi", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: true,
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route("**/api/admin/tracks*", (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
  await page.goto(`${origin}tests/browser-fixtures/index.html?locale=vi`);
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Thêm bản thu", exact: true }).click();
  await expect(page.locator('#admin-color option[value="sage"]')).toHaveText("Xanh lá dịu");
  await expect(page.locator('#admin-artwork option[value="forest"]')).toHaveText("Khu rừng");
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/admin-vi-${width}.png` });
  }
});
test("YouTube loads only after consent and unavailable videos offer another recording", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: false,
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  let externalRequests = 0;
  await page.route("https://www.youtube-nocookie.com/**", (route) => {
    externalRequests++;
    return route.fulfill({
      contentType: "text/html",
      body: "<html><body>Unavailable video fixture</body></html>",
    });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.YT={Player:class{constructor(frame,options){setTimeout(()=>options.events.onError({data:100}),20)}destroy(){}}};window.onYouTubeIframeAPIReady();",
    }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "recording", exact: true }).click();
  await page.getByRole("button", { name: "Listen to Synthetic video", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(externalRequests).toBe(0);
  await page.getByRole("button", { name: "Load YouTube player", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This video cannot be played here");
  await expect(page.locator("iframe")).toBeVisible();
  expect(externalRequests).toBe(1);
  await expect(
    page.getByRole("button", { name: "Download Synthetic video", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Choose another recording", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("sign-out cancels a pending private check-in before a slow recording starts", async ({
  page,
}) => {
  const data: PersonalData = {
    profile: {
      id: owner,
      locale: "en",
      calm_mode: false,
      mood_consent_at: new Date().toISOString(),
    },
    favorites: [],
    playlists: [],
    checkins: [],
    isAdmin: false,
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  let saved = 0;
  await page.route("**/api/sessions", (route) => {
    saved++;
    return route.fulfill({ json: { id: "30000000-0000-4000-8000-000000000001" } });
  });
  const prepared = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
  const audio = await readFile(`media/prepared/${prepared.source.path}`);
  await page.route("**/api/grants/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { url: "/fixture.mp3" } });
  });
  await page.route("**/fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "recording", exact: true }).click();
  await page.getByRole("button", { name: "Listen to Synthetic recording", exact: true }).click();
  await page.getByRole("radio", { name: "Low", exact: true }).check();
  await page.getByRole("button", { name: "Save and listen", exact: true }).click();
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText(
      "You're listening as a guest. Sign in to save a private library across devices.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.waitForResponse((response) => response.url().includes("/api/grants/"));
  await expect(page.locator(".player-buttons .play-button")).toBeEnabled();
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(saved).toBe(0);
});

test("favorites beyond the first page resolve by ID and playlists preserve their saved order", async ({
  page,
}) => {
  const template = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
  const recordings = Array.from({ length: 26 }, (_, index) => ({
    ...template,
    id: `90000000-0000-4000-8000-${String(index + 1001).padStart(12, "0")}`,
    title: { vi: `Bản thu thử ${index + 1001}`, en: `Distant recording ${index + 1001}` },
    status: "published",
  }));
  const data: PersonalData = {
    profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
    favorites: recordings.map((track) => track.id),
    playlists: [
      {
        id,
        title: "Saved order",
        revision: 0,
        trackIds: [recordings[25].id, recordings[0].id, "00000000-0000-4000-8000-000000000001"],
      },
    ],
    checkins: [],
    isAdmin: false,
  };
  const lookups: string[][] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route("**/api/tracks?*", (route) => {
    const ids = new URL(route.request().url()).searchParams.get("ids")!.split(",");
    lookups.push(ids);
    return route.fulfill({
      json: ids.flatMap((id) => recordings.find((track) => track.id === id) || []),
    });
  });
  const grants: string[] = [];
  await page.route("**/api/grants/*", (route) => {
    grants.push(new URL(route.request().url()).pathname.split("/").at(-1)!);
    return route.fulfill({
      json: { url: "/fixture.mp3", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
  });
  const audio = await readFile(`media/prepared/${template.source.path}`);
  await page.route("**/fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await expect(
    page.getByRole("button", { name: "Listen to Distant recording 1001", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next recordings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Listen to Distant recording 1025", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Listen to playlist: Saved order", exact: true }).click();
  await expect.poll(() => grants.at(-1)).toBe(recordings[25].id);
  await page.getByRole("button", { name: "Next recording", exact: true }).click();
  await expect.poll(() => grants.at(-1)).toBe(recordings[0].id);
  expect(lookups.every((ids) => ids.length <= 100)).toBe(true);
  await page.getByRole("button", { name: "mood", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
});

test("rapid next presses load one browse continuation and preserve playback", async ({ page }) => {
  const template = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
  const next = {
    ...template,
    id: "90000000-0000-4000-8000-000000001001",
    title: { vi: "Bản thu tiếp", en: "Following page recording" },
  };
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
        favorites: [],
        playlists: [],
        checkins: [],
        isAdmin: false,
      },
    }),
  );
  let requests = 0;
  await page.route("**/api/catalog?*", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ json: { items: [next], total: 2, nextCursor: null } });
  });
  await page.route("**/api/grants/*", (route) =>
    route.fulfill({
      json: { url: "/fixture.mp3", expiresAt: new Date(Date.now() + 600000).toISOString() },
    }),
  );
  const audio = await readFile(`media/prepared/${template.source.path}`);
  await page.route("**/fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  await page.goto(`${origin}tests/browser-fixtures/index.html`);
  await page.getByRole("button", { name: "browse", exact: true }).click();
  await page.getByRole("button", { name: "Listen to Synthetic recording", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
  const button = page.getByRole("button", { name: "Next recording", exact: true });
  await button.click();
  await button.click();
  await expect(page.locator(".player-bar .player-track strong")).toContainText(
    "Following page recording",
  );
  expect(requests).toBe(1);
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
});

for (const count of [1000, 10000])
  test(`catalogue discovery with ${count} isolated server-side fixture records`, async ({
    page,
  }) => {
    const original = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
    const catalogue = Array.from({ length: count }, (_, position) => ({
      ...original,
      id: `80000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
      position,
      title: {
        vi: position === count - 1 ? "Đàn bầu bên dòng sông" : `Bản thu thử ${position}`,
        en: `Scale fixture ${position}`,
      },
      category: position % 2 ? ("nature" as const) : ("instrumental" as const),
      genres: ["folk"],
      instruments: ["strings"],
      traditions: ["vietnamese"],
      status: "published" as Track["status"],
    }));
    let unavailable = false;
    const responses: number[] = [];
    await page.route("**/api/me", (route) =>
      route.fulfill({
        json: {
          profile: { id: owner, locale: "en", calm_mode: false, mood_consent_at: null },
          favorites: [],
          playlists: [],
          checkins: [],
          isAdmin: false,
        },
      }),
    );
    await page.route("**/api/catalog?*", async (route) => {
      if (unavailable)
        return route.fulfill({ status: 503, json: { error: { code: "unavailable" } } });
      const query = Object.fromEntries(new URL(route.request().url()).searchParams);
      if (query.category === "instrumental")
        await new Promise((resolve) => setTimeout(resolve, 300));
      const result = paginateTracks(catalogue, { ...query, status: "published" });
      responses.push(result.items.length);
      await route.fulfill({ json: result });
    });
    await page.goto(`${origin}tests/browser-fixtures/index.html`);
    await page.getByRole("button", { name: "catalogue", exact: true }).click();
    await expect(page.locator(".track-card:visible")).toHaveCount(24);
    await page.getByRole("button", { name: "Next recordings", exact: true }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(
      page.getByRole("button", { name: "Listen to Scale fixture 24", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Instrumentals", exact: true }).click();
    await page.getByRole("button", { name: "Nature sounds", exact: true }).click();
    await expect(page).toHaveURL(/category=nature/);
    await expect(page.getByRole("button", { name: "Nature sounds", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Listen to Scale fixture 1", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    for (const search of ["dan bau", "Đàn bầu", "dong song"]) {
      await page.getByRole("searchbox", { name: "Search recordings" }).fill(search);
      await page.getByRole("searchbox", { name: "Search recordings" }).press("Enter");
      await expect(page.locator(".track-card:visible")).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: `Listen to Scale fixture ${count - 1}`, exact: true }),
      ).toBeVisible();
    }
    catalogue[count - 1].status = "retired";
    await page.getByRole("searchbox", { name: "Search recordings" }).press("Enter");
    await expect(
      page.getByRole("heading", { name: "No recordings found", exact: true }),
    ).toBeVisible();
    unavailable = true;
    await page.getByRole("searchbox", { name: "Search recordings" }).fill("service-check");
    await page.getByRole("searchbox", { name: "Search recordings" }).press("Enter");
    await expect(page.getByRole("alert")).toContainText("The collection is unavailable");
    unavailable = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(responses.every((n) => n <= 24)).toBe(true);
  });

for (const locale of ["en", "vi"])
  test(`B2 release review explains why offline publication is disabled in ${locale}`, async ({
    page,
    context,
  }) => {
    await page.route("**/api/me", (route) =>
      route.fulfill({
        json: {
          profile: { id: owner, locale, calm_mode: false, mood_consent_at: null },
          favorites: [],
          playlists: [],
          checkins: [],
          isAdmin: true,
        },
      }),
    );
    await page.route("**/api/admin/tracks*", (route) =>
      route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
    );
    await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/admin/releases", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id,
              title: "Synthetic B2 release",
              manifestHash: "a".repeat(64),
              expectedCount: 1000,
              matchingCount: 1000,
              deliveredCount: 1000,
              storageProvider: "b2",
              publishedAt: null,
              reviewerName: null,
            },
          ],
        },
      }),
    );
    await page.goto(`${origin}tests/browser-fixtures/index.html?locale=${locale}`);
    await page.getByRole("button", { name: "admin", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name:
          locale === "en"
            ? "Attest and publish 1000 recordings"
            : "Xác nhận và công bố 1000 bản thu",
      }),
    ).toBeEnabled();
    await expect(page.getByText("Backblaze B2", { exact: true })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await context.setOffline(true);
    await expect(
      page.getByRole("button", {
        name:
          locale === "en"
            ? "Attest and publish 1000 recordings"
            : "Xác nhận và công bố 1000 bản thu",
      }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        locale === "en"
          ? "Reconnect to review and publish this release."
          : "Kết nối lại để xem xét và công bố đợt phát hành này.",
        { exact: true },
      ),
    ).toBeVisible();
    await context.setOffline(false);
  });
