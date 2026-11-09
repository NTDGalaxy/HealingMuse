import type { Page } from "@playwright/test";
import {
  test,
  expect,
  expectAccessible,
  countPersonalReads,
  expectNoHorizontalOverflow,
  expectPlaying,
  expectSameListeningSession,
  markListeningSession,
  personalReads,
} from "./support/test";
import type { PersonalData, Playlist, Track } from "@/lib/types";
import { paginateTracks } from "../../src/lib/catalog-query";
import {
  admin,
  button,
  describedBy,
  dialog as dialogs,
  harness,
  layout,
  mood,
  shell as chrome,
  size,
  youtube,
} from "./support/contracts";
import { composed, t, type Locale } from "./support/i18n";
import { preparedAudio, preparedCatalogue } from "./support/catalogue";
import { Explore, FixtureHarness, HarnessScreens, Player, Settings, Shell } from "./support/pages";

let fixtures: FixtureHarness | undefined;
test.afterAll(async () => {
  await fixtures?.close();
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/releases", (route) => route.fulfill({ json: { items: [] } }));
});
const owner = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
test.beforeAll(async () => {
  fixtures = await FixtureHarness.components();
});

/** Synthetic signed-in data for the fixture owner, as `/api/me` returns it. */
function personalData({
  locale = "en",
  consent = null,
  isAdmin = false,
  favorites = [],
  playlists = [],
}: {
  locale?: Locale;
  consent?: string | null;
  isAdmin?: boolean;
  favorites?: string[];
  playlists?: Playlist[];
} = {}): PersonalData {
  return {
    profile: { id: owner, locale, calm_mode: false, mood_consent_at: consent },
    favorites,
    playlists,
    checkins: [],
    isAdmin,
  };
}

/** An empty Content studio: no recordings and no collections. */
async function emptyStudio(page: Page) {
  await page.route("**/api/admin/tracks*", (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
}

/** Serves the first prepared recording's audio at `/fixture.mp3` and returns that recording. */
async function serveFixtureAudio(page: Page): Promise<Track> {
  const template = (await preparedCatalogue())[0];
  const audio = await preparedAudio(template);
  await page.route("**/fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  return template;
}

const lastingGrant = () => ({
  url: "/fixture.mp3",
  expiresAt: new Date(Date.now() + 600000).toISOString(),
});

function screens(page: Page, locale: Locale = "en") {
  return new HarnessScreens(page, fixtures!, locale);
}

const email = "synthetic@example.invalid";
const syntheticPassword = "synthetic password only";

test("password sign-in is the default and does not send an email", async ({ page }) => {
  const ui = screens(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: personalData({ isAdmin: true }) }),
  );
  await ui.open({ guest: true });
  await ui.signIn.click();
  const dialog = ui.dialog;
  const password = dialog.getByLabel(ui.t("auth.password"), { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await dialog.getByLabel(ui.t("auth.email"), { exact: true }).fill(email);
  await password.fill("wrong password");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: ui.t("auth.verify"), exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(ui.t("auth.invalidCredentials"));
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await password.fill(syntheticPassword);
  await dialog.getByRole("button", { name: ui.t("auth.verify"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await ui.authCalls()).toEqual(["signInWithPassword", "signInWithPassword"]);
});
for (const locale of ["en", "vi"] as const) {
  test(`password controls are accessible and clear credentials on close in ${locale}`, async ({
    page,
  }) => {
    const ui = screens(page, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await ui.open({ guest: true, locale });
    const trigger = ui.signIn;
    await trigger.click();
    const dialog = ui.dialog;
    const password = dialog.getByLabel(ui.t("auth.password"), { exact: true });
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(dialog.getByLabel(ui.t("auth.email"), { exact: true })).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await password.fill(syntheticPassword);
    const show = dialog.getByRole("button", { name: ui.t("auth.showPassword"), exact: true });
    // Measure the usable target after the dialog's scale entrance has settled.
    await expect
      .poll(async () => {
        const bounds = await show.boundingBox();
        return (
          bounds !== null && bounds.width >= size.touchTarget && bounds.height >= size.touchTarget
        );
      })
      .toBe(true);
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    await dialog.getByRole("button", { name: ui.t("auth.hidePassword"), exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    for (let tab = 0; tab < 14; tab++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await expectAccessible(page);
    await page.screenshot({
      path: `test-results/password-sign-in-${locale}-phone.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(password).toHaveValue("");
    await expect(password).toHaveAttribute("type", "password");
    await expectNoHorizontalOverflow(page);
  });
}
test("password and email limits are announced separately without automatic retries", async ({
  page,
}) => {
  const ui = screens(page);
  await ui.open({ guest: true, flags: ["request-limit"] });
  await ui.signIn.click();
  const dialog = ui.dialog;
  const emailField = dialog.getByLabel(ui.t("auth.email"), { exact: true });
  await emailField.fill(email);
  await dialog.getByLabel(ui.t("auth.password"), { exact: true }).fill(syntheticPassword);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: ui.t("auth.verify"), exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(ui.t("auth.rateLimit"));
  expect(await ui.authCalls()).toEqual(["signInWithPassword"]);
  await ui.open({ guest: true, flags: ["email-limit"] });
  await ui.signIn.click();
  await dialog.getByRole("button", { name: ui.t("auth.forgotPassword"), exact: true }).click();
  await expect(emailField).toBeFocused();
  await emailField.fill(email);
  await dialog.getByRole("button", { name: ui.t("auth.sendRecovery"), exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(ui.t("auth.emailLimit"));
  expect(await ui.authCalls()).toEqual(["resetPasswordForEmail"]);
});
test("recovery preserves the current origin and locale and gives a private confirmation", async ({
  page,
}) => {
  const ui = screens(page, "vi");
  await ui.open({ guest: true, locale: "vi" });
  await ui.signIn.click();
  const dialog = ui.dialog;
  await dialog.getByRole("button", { name: ui.t("auth.forgotPassword"), exact: true }).click();
  await dialog.getByLabel(ui.t("auth.email"), { exact: true }).fill(email);
  await dialog.getByRole("button", { name: ui.t("auth.sendRecovery"), exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(ui.t("auth.recoverySent"));
  await expect(dialog.getByRole("status")).toBeFocused();
  expect(await ui.recoveryPath()).toBe("/vi/reset-password");
  expect(await ui.authCalls()).toEqual(["resetPasswordForEmail"]);
});
test("password updates require a session, validate confirmation and clear the saved password", async ({
  page,
}) => {
  const ui = screens(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  const newPassword = page.getByLabel(ui.t("auth.newPassword"), { exact: true });
  const confirmation = page.getByLabel(ui.t("auth.confirmPassword"), { exact: true });
  await ui.open({ guest: true });
  await ui.show("password");
  await expect(newPassword).toHaveCount(0);
  expect(await ui.authCalls()).toEqual([]);
  await ui.open();
  await ui.show("password");
  await newPassword.fill(syntheticPassword);
  await confirmation.fill("another synthetic password");
  await ui.button("auth.savePassword").click();
  await expect(page.getByRole("alert")).toContainText(ui.t("auth.passwordMismatch"));
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  expect(await ui.authCalls()).toEqual([]);
  await confirmation.fill(syntheticPassword);
  await ui.button("auth.savePassword").click();
  await expect(page.getByRole("status")).toContainText(ui.t("auth.passwordSaved"));
  await expect(page.getByRole("status")).toBeFocused();
  await expect(newPassword).toHaveCount(0);
  expect(await ui.authCalls()).toEqual(["updateUser"]);
});
test("server password-policy failures are announced on the new password field", async ({
  page,
}) => {
  const ui = screens(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  await ui.open({ flags: ["password-update-error"] });
  await ui.show("password");
  const newPassword = page.getByLabel(ui.t("auth.newPassword"), { exact: true });
  await newPassword.fill(syntheticPassword);
  await page.getByLabel(ui.t("auth.confirmPassword"), { exact: true }).fill(syntheticPassword);
  await ui.button("auth.savePassword").click();
  await expect(page.getByRole("alert")).toContainText(ui.t("auth.passwordUpdateError"));
  await expect(newPassword).toHaveAttribute("aria-invalid", "true");
  await expect(newPassword).toHaveAttribute("aria-describedby", describedBy.newPassword);
  await expectAccessible(page);
  expect(await ui.authCalls()).toEqual(["updateUser"]);
});
test("named release review checks delivery, records confirmations and reports a changed manifest", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData({ isAdmin: true });
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
  const reviewer = "Synthetic human reviewer";
  let changed = true;
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await emptyStudio(page);
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
  await ui.open();
  await ui.show("admin");
  const publish = page.getByRole("button", {
    name: ui.t("admin.release.publish", { count: 1000 }),
  });
  await expect(publish).toBeDisabled();
  release.deliveredCount = 1000;
  await ui.show("library");
  await ui.show("admin");
  await expect(publish).toBeEnabled();
  await page.getByRole("textbox", { name: ui.t("admin.release.name") }).fill(reviewer);
  await publish.click();
  expect(submissions).toHaveLength(0);
  for (const key of [
    "admin.release.listening",
    "admin.release.rights",
    "admin.release.provenance",
  ] as const)
    await page.getByRole("checkbox", { name: ui.t(key), exact: true }).check();
  await publish.click();
  await expect(page.getByRole("alert")).toContainText(ui.t("admin.release.changed"));
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
  await expect(page.locator(admin.releaseStatus)).toContainText(
    ui.t("admin.release.published", { name: reviewer }),
  );
  await expectAccessible(page);
});
test("synthetic accounts manage a library, paired check-ins, erasure, and sign-out", async ({
  page,
}) => {
  const ui = screens(page);
  const settings = new Settings(page);
  const A = harness.recording.id,
    B = harness.secondRecording.id,
    session = "30000000-0000-4000-8000-000000000001";
  const data = personalData();
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
  await serveFixtureAudio(page);
  await page.route("**/api/grants/*", (route) => route.fulfill({ json: lastingGrant() }));
  const playlist = "Evening";
  const recording = harness.recording.title.en;
  const deleteHistory = page.getByRole("button", { name: ui.t("mood.deleteAll"), exact: true });
  await ui.open();
  await ui.button("library.newPlaylist").click();
  await page.getByRole("textbox", { name: ui.t("library.playlistTitle") }).fill(playlist);
  await ui.button("common.save").click();
  await ui.show("recording");
  await ui.recordings.favorite(recording).click();
  for (const title of [recording, harness.secondRecording.title.en]) {
    await ui.recordings.details(title).click();
    await ui.button("catalog.playlistAdd").click();
    await page.getByRole("button", { name: playlist, exact: true }).click();
    await expect(ui.dialog).toHaveCount(0);
  }
  await ui.show("library");
  await ui.button("library.editPlaylist").click();
  await ui.button("library.moveUp", { title: harness.secondRecording.title.en }).click();
  await ui.button("common.save").click();
  expect(data.playlists[0].trackIds).toEqual([B, A]);
  await ui.show("mood");
  await ui.button("mood.enable").click();
  await expect(
    page.getByRole("heading", { name: ui.t("mood.trendTitle"), exact: true }),
  ).toBeVisible();
  await ui.show("recording");
  await ui.recordings.listen(recording).click();
  await page.getByRole("radio", { name: ui.t("mood.score2"), exact: true }).check();
  await ui.button("mood.saveListen").click();
  await expectPlaying(page);
  await expect.poll(() => data.checkins.length).toBe(1);
  await new Player(page).button("finish").click();
  await page.getByRole("radio", { name: ui.t("mood.score4"), exact: true }).check();
  await ui.button("mood.saveAfter").click();
  await expect(ui.dialog).toHaveCount(0);
  expect(data.checkins.map((item) => item.phase)).toEqual(["before", "after"]);
  await ui.show("mood");
  await deleteHistory.hover();
  await expectAccessible(page, button.secondaryDanger, { only: ["color-contrast"] });
  await deleteHistory.click();
  await ui.dialog.getByRole("button", { name: ui.t("mood.deleteAll"), exact: true }).click();
  await expect(page.getByRole("heading", { name: ui.t("mood.empty"), exact: true })).toBeVisible();
  await ui.show("settings");
  await settings.deleteAccountPermanently();
  await expect(settings.guestNote).toBeVisible();
});
test("a conflicting playlist edit shows the latest version before another save", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData({
    playlists: [{ id, title: "Original playlist", revision: 0, trackIds: [] }],
  });
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
  const name = page.getByRole("textbox", { name: ui.t("library.playlistTitle") });
  await ui.open();
  await ui.button("library.editPlaylist").click();
  await name.fill("My conflicting edit");
  await ui.button("common.save").click();
  await expect(name).toHaveValue("Changed on another device");
  await expect(ui.dialog.getByRole("alert")).toContainText(ui.t("errors.conflict"));
});
test("synthetic authentication, consent, personal history, and administration forms are accessible", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData({ isAdmin: true });
  await page.route("**/api/me", async (route) => {
    if (route.request().method() === "PATCH") {
      const change = route.request().postDataJSON();
      if (change.moodConsent !== undefined)
        data.profile.mood_consent_at = change.moodConsent ? new Date().toISOString() : null;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: data });
  });
  await emptyStudio(page);
  await ui.open({ guest: true });
  await ui.namedSignIn.click();
  await page.getByRole("textbox", { name: ui.t("auth.email"), exact: true }).fill(email);
  await page.getByRole("checkbox").check();
  await ui.button("auth.useEmailCode").click();
  await ui.button("auth.sendCode").click();
  const code = page.getByRole("textbox", { name: ui.t("auth.code"), exact: true });
  const verify = page.getByRole("button", { name: ui.t("auth.verify"), exact: true }).last();
  await code.fill("000000");
  await verify.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAttribute("aria-describedby", describedBy.signInCode);
  await code.fill("123456");
  await verify.click();
  await expect(ui.dialog).toHaveCount(0);
  await ui.show("mood");
  await ui.button("mood.enable").click();
  await expect(
    page.getByRole("heading", { name: ui.t("mood.trendTitle"), exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
  await ui.show("admin");
  await ui.button("admin.new").click();
  await expect(page.getByLabel(ui.t("admin.descriptionEn"), { exact: true })).toHaveAttribute(
    "maxlength",
    "600",
  );
  await expect(page.getByLabel(ui.t("admin.duration"), { exact: true })).toHaveAttribute(
    "max",
    "14400",
  );
  await expect(page.locator(admin.colorOption("sage"))).toHaveText(ui.t("admin.colorOptions.sage"));
  await expectAccessible(page);
});
test("a selected private check-in remains readable in Night appearance", async ({
  page,
  appearance,
}) => {
  const ui = screens(page);
  await appearance({ theme: "night", garden: "still" });
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: personalData({ consent: new Date().toISOString() }) }),
  );
  await ui.open();
  await new Shell(page).expectTheme("night");
  await expect(ui.button("library.newPlaylist")).toBeVisible();
  await ui.show("recording");
  await ui.recordings.listen(harness.recording.title.en).click();
  await page.locator(mood.scoreInput(3)).check();
  await expect(page.locator(mood.selectedScoreInput(3))).toBeChecked();
  await expectAccessible(page, dialogs.content);
});
test("recording saves cannot publish outside release review and support retirement", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData({ isAdmin: true });
  const tracks: unknown[] = [];
  const title = "Synthetic studio recording";
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
  await ui.open();
  await ui.show("admin");
  await ui.button("admin.new").click();
  for (const [key, value] of [
    ["admin.titleVi", "Bản thu thử"],
    ["admin.titleEn", title],
    ["admin.descriptionVi", "Dữ liệu thử nghiệm"],
    ["admin.descriptionEn", "Synthetic fixture only"],
    ["admin.artist", "Synthetic fixture"],
    ["admin.attribution", "Synthetic fixture only"],
    ["admin.license", "CC0"],
    ["admin.provenance", "https://example.invalid/fixture"],
    ["admin.sourceValue", "synthetic.mp3"],
  ] as const)
    await page.getByRole("textbox", { name: ui.t(key), exact: true }).fill(value);
  // Publishing happens only through release review: an unpublished recording cannot be
  // published from the editor, even with every review box checked.
  const status = page.getByLabel(ui.t("admin.status"), { exact: true });
  await expect(status.locator("option")).toHaveText([ui.t("admin.draft"), ui.t("admin.retired")]);
  for (const key of ["admin.rights", "admin.human", "admin.listening"] as const)
    await page.getByRole("checkbox", { name: ui.t(key), exact: true }).check();
  await ui.button("admin.save").click();
  await expect(ui.dialog).toHaveCount(0);
  await expect(page.locator(admin.statusPill)).toHaveText(ui.t("admin.draft"));
  expect(tracks).toMatchObject([{ status: "draft" }]);
  // Once release review has published it, metadata edits keep the published status available.
  (tracks[0] as { status: string }).status = "published";
  await page.reload();
  await ui.show("admin");
  await expect(page.locator(admin.statusPill)).toHaveText(ui.t("admin.published"));
  await page
    .getByRole("button", { name: composed.editRecording("en", title), exact: true })
    .click();
  await expect(status).toHaveValue("published");
  await expect(status.locator("option")).toHaveText([
    ui.t("admin.draft"),
    ui.t("admin.published"),
    ui.t("admin.retired"),
  ]);
  await ui.button("admin.reject").click();
  await expect(page.locator(admin.statusPill)).toHaveText(ui.t("admin.retired"));
});
for (const locale of ["vi", "en"] as const)
  for (const theme of ["day", "night"] as const)
    test(`signed-in ${locale} ${theme} screens and mood choices reflow at three sizes`, async ({
      page,
      appearance,
    }) => {
      const ui = screens(page, locale);
      const settings = new Settings(page, locale);
      await appearance({ theme, garden: "still" });
      const data = personalData({
        locale,
        consent: new Date().toISOString(),
        isAdmin: true,
        favorites: [harness.recording.id],
      });
      await page.route("**/api/me", (route) => route.fulfill({ json: data }));
      await emptyStudio(page);
      await ui.open({ locale });
      await new Shell(page, locale).expectTheme(theme);
      await ui.show("mood");
      await expect(page.locator(mood.trends)).toBeVisible();
      for (const width of [390, 820, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const view of ["library", "mood", "settings", "admin"] as const) {
          await ui.show(view);
          if (view === "settings") {
            const account = await settings.account.boundingBox();
            const privacy = await settings.privacy.boundingBox();
            const install = await settings.install.boundingBox();
            if (width >= layout.twoColumnMinWidth) {
              expect(account!.y).toBeCloseTo(privacy!.y, 0);
              expect(account!.height).toBeCloseTo(privacy!.height, 0);
              expect(install!.width).toBeCloseTo(
                account!.width + privacy!.width + layout.panelGap,
                0,
              );
            } else {
              expect(privacy!.y).toBeGreaterThanOrEqual(
                account!.y + account!.height + layout.panelGap - 1,
              );
              expect(install!.width).toBeCloseTo(account!.width, 0);
            }
            await expect(settings.accountDanger).toHaveCount(1);
            for (const actions of await settings.actionGroups.all()) {
              const bounds = await actions.locator(chrome.children).evaluateAll((elements) =>
                elements.map((element) => {
                  const { x, y, width, height } = element.getBoundingClientRect();
                  return { x, y, width, height };
                }),
              );
              expect(bounds.every((box) => box.height >= size.touchTarget)).toBe(true);
              expect(
                bounds[1].x >= bounds[0].x + bounds[0].width + layout.actionGap ||
                  bounds[1].y >= bounds[0].y + bounds[0].height + layout.actionGap,
              ).toBe(true);
            }
          }
          await expectNoHorizontalOverflow(page);
          await expectAccessible(page);
          await page.screenshot({
            path: `artifacts/design/${view}-${locale}-${theme}-${width}.png`,
            fullPage: true,
          });
        }
        await ui.show("recording");
        await ui.recordings.listen(harness.recording.title[locale]).click();
        const dialog = ui.dialog;
        await expect(dialog.getByRole("radio")).toHaveCount(5);
        await page.screenshot({ path: `artifacts/design/checkin-${locale}-${theme}-${width}.png` });
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        for (const label of await dialog.locator(mood.scoreLabel).all()) {
          expect(
            await label.evaluate((element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
            ),
          ).toBeGreaterThanOrEqual(size.readableFont);
          expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(size.touchTarget);
        }
        await page.keyboard.press("Escape");
      }
    });
test("Vietnamese content forms use translated options across phone, tablet, and desktop", async ({
  page,
}) => {
  const ui = screens(page, "vi");
  const data = personalData({ locale: "vi", isAdmin: true });
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await emptyStudio(page);
  await ui.open({ locale: "vi" });
  await ui.show("admin");
  await ui.button("admin.new").click();
  await expect(page.locator(admin.colorOption("sage"))).toHaveText(ui.t("admin.colorOptions.sage"));
  await expect(page.locator(admin.artworkOption("forest"))).toHaveText(
    ui.t("admin.artworkOptions.forest"),
  );
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAccessible(page);
    await page.screenshot({ path: `test-results/admin-vi-${width}.png` });
  }
});
test("YouTube loads only after consent and unavailable videos offer another recording", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData();
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
  const frame = page.locator(youtube.frame);
  await ui.open();
  await ui.show("recording");
  await ui.recordings.listen(harness.video.title.en).click();
  await expect(frame).toHaveCount(0);
  expect(externalRequests).toBe(0);
  await ui.button("catalog.youtubeStart").click();
  await expect(page.getByRole("alert")).toContainText(ui.t("catalog.youtubeUnavailable"));
  await expect(frame).toBeVisible();
  expect(externalRequests).toBe(1);
  await expect(ui.recordings.download(harness.video.title.en)).toHaveCount(0);
  await ui.button("catalog.chooseAnother").click();
  await expect(ui.dialog).toHaveCount(0);
  await expect(frame).toHaveCount(0);
});
test("sign-out cancels a pending private check-in before a slow recording starts", async ({
  page,
}) => {
  const ui = screens(page);
  const settings = new Settings(page);
  const player = new Player(page);
  const data = personalData({ consent: new Date().toISOString() });
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  let saved = 0;
  await page.route("**/api/sessions", (route) => {
    saved++;
    return route.fulfill({ json: { id: "30000000-0000-4000-8000-000000000001" } });
  });
  await serveFixtureAudio(page);
  await page.route("**/api/grants/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { url: "/fixture.mp3" } });
  });
  await ui.open();
  await ui.show("recording");
  await ui.recordings.listen(harness.recording.title.en).click();
  await page.getByRole("radio", { name: ui.t("mood.score2"), exact: true }).check();
  await ui.button("mood.saveListen").click();
  await ui.show("settings");
  await settings.signOut.click();
  await expect(settings.guestNote).toBeVisible();
  await page.waitForResponse((response) => response.url().includes("/api/grants/"));
  await expect(player.playButton).toBeEnabled();
  await player.button("finish").click();
  await expect(ui.dialog).toHaveCount(0);
  expect(saved).toBe(0);
});

test("favorites beyond the first page resolve by ID and playlists preserve their saved order", async ({
  page,
}) => {
  const ui = screens(page);
  const template = await serveFixtureAudio(page);
  const recordings = Array.from({ length: 26 }, (_, index) => ({
    ...template,
    id: `90000000-0000-4000-8000-${String(index + 1001).padStart(12, "0")}`,
    title: { vi: `Bản thu thử ${index + 1001}`, en: `Distant recording ${index + 1001}` },
    status: "published",
  }));
  const playlist = "Saved order";
  const data = personalData({
    favorites: recordings.map((track) => track.id),
    playlists: [
      {
        id,
        title: playlist,
        revision: 0,
        trackIds: [recordings[25].id, recordings[0].id, harness.recording.id],
      },
    ],
  });
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
    return route.fulfill({ json: lastingGrant() });
  });
  await ui.open();
  await expect(ui.recordings.listen(recordings[0].title.en)).toBeVisible();
  await ui.button("catalog.next").click();
  await expect(ui.recordings.listen(recordings[24].title.en)).toBeVisible();
  await page
    .getByRole("button", { name: composed.listenToPlaylist("en", playlist), exact: true })
    .click();
  await expect.poll(() => grants.at(-1)).toBe(recordings[25].id);
  await new Player(page).button("next").click();
  await expect.poll(() => grants.at(-1)).toBe(recordings[0].id);
  expect(lookups.every((ids) => ids.length <= 100)).toBe(true);
  await ui.show("mood");
  await expectPlaying(page);
});

test("rapid next presses load one browse continuation and preserve playback", async ({ page }) => {
  const ui = screens(page);
  const player = new Player(page);
  const template = await serveFixtureAudio(page);
  const next = {
    ...template,
    id: "90000000-0000-4000-8000-000000001001",
    title: { vi: "Bản thu tiếp", en: "Following page recording" },
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  let requests = 0;
  await page.route("**/api/catalog?*", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ json: { items: [next], total: 2, nextCursor: null } });
  });
  await page.route("**/api/grants/*", (route) => route.fulfill({ json: lastingGrant() }));
  await ui.open();
  await ui.show("browse");
  await ui.recordings.listen(harness.recording.title.en).click();
  await expectPlaying(page);
  const button = player.button("next");
  await button.click();
  await button.click();
  await expect(player.currentTitle).toContainText(next.title.en);
  expect(requests).toBe(1);
  await expectPlaying(page);
});

for (const count of [1000, 10000])
  test(`catalogue discovery with ${count} isolated server-side fixture records`, async ({
    page,
  }) => {
    const ui = screens(page);
    const explore = new Explore(page);
    const original = (await preparedCatalogue())[0];
    const catalogue: Track[] = Array.from({ length: count }, (_, position) => ({
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
    await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
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
    await ui.open();
    await ui.show("catalogue");
    await expect(explore.recordings.visibleCards).toHaveCount(24);
    await explore.nextPage.click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(explore.recordings.listen(catalogue[24].title.en)).toBeVisible();
    await explore.category("instrumental").click();
    await explore.category("nature").click();
    await expect(page).toHaveURL(/category=nature/);
    await expect(explore.category("nature")).toHaveAttribute("aria-pressed", "true");
    await expect(explore.recordings.listen(catalogue[1].title.en)).toBeVisible();
    await explore.allCategories.click();
    for (const search of ["dan bau", "Đàn bầu", "dong song"]) {
      await explore.searchFor(search);
      await expect(explore.recordings.visibleCards).toHaveCount(1);
      await expect(explore.recordings.listen(catalogue[count - 1].title.en)).toBeVisible();
    }
    catalogue[count - 1].status = "retired";
    await explore.search().press("Enter");
    await expect(explore.noResults).toBeVisible();
    unavailable = true;
    await explore.searchFor("service-check");
    await expect(explore.alert).toContainText(ui.t("catalog.unavailable"));
    unavailable = false;
    await explore.retry.click();
    await expect(explore.alert).toHaveCount(0);
    expect(responses.every((n) => n <= 24)).toBe(true);
  });

for (const locale of ["en", "vi"] as const)
  test(`B2 release review explains why offline publication is disabled in ${locale}`, async ({
    page,
    context,
  }) => {
    const ui = screens(page, locale);
    await page.route("**/api/me", (route) =>
      route.fulfill({ json: personalData({ locale, isAdmin: true }) }),
    );
    await emptyStudio(page);
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
    const publish = page.getByRole("button", {
      name: t(locale, "admin.release.publish", { count: 1000 }),
    });
    await ui.open({ locale });
    await ui.show("admin");
    await expect(publish).toBeEnabled();
    await expect(page.getByText(admin.storageProvider.b2, { exact: true })).toBeVisible();
    await expectAccessible(page);
    await context.setOffline(true);
    await expect(publish).toBeDisabled();
    await expect(page.getByText(ui.t("admin.release.offline"), { exact: true })).toBeVisible();
    await context.setOffline(false);
  });
test("a language switch keeps account subscriptions and personal data", async ({ page }) => {
  const ui = screens(page);
  await countPersonalReads(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  await ui.open();
  await expect(
    page.getByRole("heading", { name: ui.t("library.favorites"), exact: true }),
  ).toBeVisible();
  // Initial session plus the Realtime subscription confirmation.
  await expect.poll(() => personalReads(page)).toBe(2);
  const subscriptions = await ui.subscriptions();
  expect(subscriptions).toEqual({ auth: 1, channels: 1 });
  for (const locale of ["vi", "en"] as const) {
    await ui.switchLanguage.click();
    await new Shell(page, locale).expectLang(locale);
    await expect(
      page.getByRole("heading", { name: t(locale, "library.favorites"), exact: true }),
    ).toBeVisible();
    expect(await personalReads(page)).toBe(2);
    expect(await ui.subscriptions()).toEqual(subscriptions);
  }
});
test("the Realtime echo of a saved favorite does not reload personal data again", async ({
  page,
}) => {
  const ui = screens(page);
  const title = harness.recording.title.en;
  await countPersonalReads(page);
  const favorites: string[] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData({ favorites }) }));
  await page.route("**/api/favorites", async (route) => {
    favorites.push(JSON.parse(route.request().postData()!).trackId);
    // The database trigger broadcasts on commit, before and around the HTTP response.
    await ui.broadcast("invalidate");
    await route.fulfill({ json: { ok: true } });
    await ui.broadcast("invalidate");
  });
  await ui.open();
  await ui.show("recording");
  await expect.poll(() => personalReads(page)).toBe(2);
  // A change made on another device still reloads personal data.
  await ui.broadcast("invalidate");
  await expect.poll(() => personalReads(page)).toBe(3);
  await ui.button("catalog.favorite", { title }).click();
  await expect(ui.button("catalog.unfavorite", { title })).toHaveAttribute("aria-pressed", "true");
  await ui.broadcast("invalidate");
  expect(await personalReads(page)).toBe(4);
});
test("sign-in consent links open on the client without stopping playback", async ({ page }) => {
  const ui = screens(page);
  await serveFixtureAudio(page);
  await page.route("**/api/grants/*", (route) => route.fulfill({ json: lastingGrant() }));
  await ui.open({ guest: true });
  await ui.show("recording");
  await ui.recordings.listen(harness.recording.title.en).click();
  await expectPlaying(page);
  await markListeningSession(page, "consent");
  await ui.signIn.click();
  await ui.dialog.getByRole("link", { name: ui.t("nav.privacy"), exact: true }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await expect(ui.dialog).toHaveCount(0);
  await expectSameListeningSession(page, "consent");
});
test("a playlist can be reordered and saved from the keyboard", async ({ page }) => {
  const ui = screens(page);
  const [first, second, third] = [harness.recording, harness.secondRecording, harness.video];
  const data = personalData({
    playlists: [
      { id, title: "Keyboard order", revision: 0, trackIds: [first.id, second.id, third.id] },
    ],
  });
  const saved: string[][] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route(`**/api/playlists/${id}`, (route) => {
    const input = route.request().postDataJSON();
    saved.push(input.trackIds);
    data.playlists = [
      { id, title: input.title, revision: input.revision + 1, trackIds: input.trackIds },
    ];
    return route.fulfill({ json: { ok: true } });
  });
  await ui.open();
  await ui.button("library.editPlaylist").click();
  const moveFirstDown = ui.button("library.moveDown", { title: first.title.en });
  await moveFirstDown.focus();
  await page.keyboard.press("Enter");
  // The control that moved keeps focus, so the next key press continues from it.
  await expect(moveFirstDown).toBeFocused();
  const moveThirdUp = ui.button("library.moveUp", { title: third.title.en });
  await moveThirdUp.focus();
  await page.keyboard.press("Space");
  await expect(moveThirdUp).toBeFocused();
  await page.getByRole("textbox", { name: ui.t("library.playlistTitle") }).press("Enter");
  await expect(ui.dialog).toHaveCount(0);
  expect(saved).toEqual([[second.id, third.id, first.id]]);
});
test("a confirmation takes focus, returns it on Escape and confirms from the keyboard", async ({
  page,
}) => {
  const ui = screens(page);
  const data = personalData({ consent: new Date().toISOString() });
  data.checkins = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      session_id: "30000000-0000-4000-8000-000000000001",
      phase: "before",
      score: 3,
      created_at: new Date().toISOString(),
    },
  ];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route("**/api/sessions", (route) => {
    data.checkins = [];
    return route.fulfill({ json: { ok: true } });
  });
  await ui.open();
  await ui.show("mood");
  const trigger = ui.button("mood.deleteAll");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = ui.dialog;
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = dialog.getByRole("button", { name: ui.t("mood.deleteAll"), exact: true });
  // Focus starts on the dialog's close control, so a stray Enter never deletes anything.
  await expect(
    dialog.getByRole("button", { name: ui.t("common.close"), exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: ui.t("mood.empty"), exact: true })).toBeVisible();
});
test("keyboard focus stays in the playlist editor when an item reaches an end or is removed", async ({
  page,
}) => {
  const ui = screens(page);
  const [first, second, third] = [harness.recording, harness.secondRecording, harness.video];
  const data = personalData({
    playlists: [
      { id, title: "Keyboard order", revision: 0, trackIds: [first.id, second.id, third.id] },
    ],
  });
  const saved: string[][] = [];
  await page.route("**/api/me", (route) => route.fulfill({ json: data }));
  await page.route(`**/api/playlists/${id}`, (route) => {
    saved.push(route.request().postDataJSON().trackIds);
    return route.fulfill({ json: { ok: true } });
  });
  await ui.open();
  await ui.button("library.editPlaylist").click();
  await ui.button("library.moveUp", { title: second.title.en }).focus();
  await page.keyboard.press("Enter");
  // At the top its Move up control is disabled, so focus continues on its Move down control.
  const moveSecondDown = ui.button("library.moveDown", { title: second.title.en });
  await expect(moveSecondDown).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(moveSecondDown).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ui.button("library.moveUp", { title: second.title.en })).toBeFocused();
  // Removing an item hands focus to the item that takes its place.
  await page
    .getByRole("button", { name: composed.removeFromList("en", third.title.en), exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: composed.removeFromList("en", second.title.en), exact: true }),
  ).toBeFocused();
  await page.getByRole("textbox", { name: ui.t("library.playlistTitle") }).press("Enter");
  await expect(ui.dialog).toHaveCount(0);
  expect(saved).toEqual([[first.id, second.id]]);
});
test("signed-in screens wait for personal data instead of offering consent again", async ({
  page,
}) => {
  const ui = screens(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requested!: () => void;
  const reached = new Promise<void>((resolve) => (requested = resolve));
  await page.route("**/api/me", async (route) => {
    requested();
    await held;
    await route.fulfill({ json: personalData({ consent: new Date().toISOString() }) });
  });
  await ui.open();
  await ui.show("mood");
  // The account is known once its personal data is requested; the response is still held.
  await reached;
  await expect(page.getByRole("status")).toHaveText(ui.t("common.loading"));
  await expect(ui.button("mood.enable")).toHaveCount(0);
  await ui.show("library");
  await expect(page.getByRole("status")).toHaveText(ui.t("common.loading"));
  await expect(ui.button("library.newPlaylist")).toHaveCount(0);
  release();
  await expect(ui.button("library.newPlaylist")).toBeVisible();
  await ui.show("mood");
  await expect(
    page.getByRole("heading", { name: ui.t("mood.trendTitle"), exact: true }),
  ).toBeVisible();
  await expect(ui.button("mood.enable")).toHaveCount(0);
});
test("the content studio downloads only once the account is known to be an administrator", async ({
  page,
}) => {
  const ui = screens(page);
  let isAdmin = false;
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData({ isAdmin }) }));
  await emptyStudio(page);
  const restricted = page.getByText(ui.t("admin.restrictedText"), { exact: true });
  await ui.open({ guest: true });
  await ui.show("admin");
  await expect(
    page.getByRole("heading", { name: ui.t("auth.requiredAdmin"), exact: true }),
  ).toBeVisible();
  await ui.open();
  await ui.show("admin");
  await expect(restricted).toBeVisible();
  expect(ui.moduleRequests(harness.modules.adminConsole)).toBe(0);
  isAdmin = true;
  await ui.open();
  await ui.show("admin");
  await expect(ui.button("admin.new")).toBeVisible();
  await expect(restricted).toHaveCount(0);
  expect(ui.moduleRequests(harness.modules.adminConsole)).toBe(1);
});
test("content studio Back returns to the previous page of recordings", async ({ page }) => {
  const ui = screens(page);
  const template = (await preparedCatalogue())[0];
  // Three pages of studio rows behind opaque cursors, as /api/admin/tracks pages them.
  const pages = [1, 2, 3].map((number) => ({
    cursor: number === 1 ? "" : `synthetic-page-${number}`,
    title: `Studio page ${number} recording`,
  }));
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: personalData({ isAdmin: true }) }),
  );
  await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/tracks?*", (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor") ?? "";
    const index = pages.findIndex((entry) => entry.cursor === cursor);
    return route.fulfill({
      json: {
        items: [
          {
            ...template,
            id: `70000000-0000-4000-8000-00000000000${index + 1}`,
            title: { vi: pages[index].title, en: pages[index].title },
          },
        ],
        total: pages.length,
        nextCursor: pages[index + 1]?.cursor ?? null,
      },
    });
  });
  const row = (number: number) =>
    page.getByRole("button", {
      name: composed.editRecording("en", pages[number - 1].title),
      exact: true,
    });
  await ui.open();
  await ui.show("admin");
  await expect(row(1)).toBeVisible();
  await ui.button("catalog.next").click();
  await expect(row(2)).toBeVisible();
  await ui.button("catalog.next").click();
  await expect(row(3)).toBeVisible();
  await ui.button("common.back").click();
  await expect(row(2)).toBeVisible();
  await ui.button("common.back").click();
  await expect(row(1)).toBeVisible();
  await expect(ui.button("common.back")).toHaveCount(0);
});
test("a guest visit never downloads the sign-in client until sign-in opens", async ({ page }) => {
  const ui = screens(page);
  await ui.open({ guest: true });
  for (const view of ["library", "mood", "admin", "settings", "password", "recording"] as const)
    await ui.show(view);
  await ui.recordings.details(harness.recording.title.en).click();
  await expect(ui.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ui.dialog).toHaveCount(0);
  expect(ui.moduleRequests(harness.modules.authClient)).toBe(0);
  await ui.signIn.click();
  await expect(ui.dialog.getByLabel(ui.t("auth.email"), { exact: true })).toBeVisible();
  await expect.poll(() => ui.moduleRequests(harness.modules.authClient)).toBe(1);
});
test("email-code sign-in loads the client on demand and restores the account", async ({ page }) => {
  const ui = screens(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  await ui.open({ guest: true });
  await ui.signIn.click();
  const dialog = ui.dialog;
  await dialog.getByRole("textbox", { name: ui.t("auth.email"), exact: true }).fill(email);
  await dialog.getByRole("checkbox").check();
  await ui.button("auth.useEmailCode").click();
  await ui.button("auth.sendCode").click();
  await dialog.getByRole("textbox", { name: ui.t("auth.code"), exact: true }).fill("123456");
  await dialog.getByRole("button", { name: ui.t("auth.verify"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ui.button("library.newPlaylist")).toBeVisible();
  expect(await ui.authCalls()).toEqual(["signInWithOtp", "verifyOtp"]);
  expect(ui.moduleRequests(harness.modules.authClient)).toBe(1);
});
test("a password-recovery link restores its session before the new-password form", async ({
  page,
}) => {
  const ui = screens(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  // The recovery email's link lands without a session cookie, carrying a one-time code.
  await ui.open({ guest: true, flags: ["code=synthetic-recovery"] });
  await ui.show("password");
  const newPassword = page.getByLabel(ui.t("auth.newPassword"), { exact: true });
  await newPassword.fill(syntheticPassword);
  await page.getByLabel(ui.t("auth.confirmPassword"), { exact: true }).fill(syntheticPassword);
  await ui.button("auth.savePassword").click();
  await expect(page.getByRole("status")).toContainText(ui.t("auth.passwordSaved"));
  expect(await ui.authCalls()).toEqual(["exchangeCodeForSession", "updateUser"]);
});
test("signing in or out in one tab updates another open tab", async ({ page, context }) => {
  await context.route("**/api/me", (route) => route.fulfill({ json: personalData() }));
  const first = screens(page);
  const second = screens(await context.newPage());
  const firstSettings = new Settings(first.page);
  const secondSettings = new Settings(second.page);
  await first.open({ guest: true });
  await second.open({ guest: true });
  await first.show("settings");
  await second.show("settings");
  await expect(secondSettings.guestNote).toBeVisible();
  expect(second.moduleRequests(harness.modules.authClient)).toBe(0);
  await first.signIn.click();
  const dialog = first.dialog;
  await dialog.getByLabel(first.t("auth.email"), { exact: true }).fill(email);
  await dialog.getByLabel(first.t("auth.password"), { exact: true }).fill(syntheticPassword);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: first.t("auth.verify"), exact: true }).click();
  await expect(firstSettings.signOut).toBeVisible();
  await expect(secondSettings.signOut).toBeVisible();
  await secondSettings.signOut.click();
  await expect(secondSettings.guestNote).toBeVisible();
  await expect(firstSettings.guestNote).toBeVisible();
});
