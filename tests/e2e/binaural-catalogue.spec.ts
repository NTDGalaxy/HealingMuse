import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { paginateTracks } from "../../src/lib/catalog-query";
import type { Track } from "@/lib/types";

async function catalogue() {
  const template: Track = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"))[0];
  return Array.from({ length: 348 }, (_, index): Track => ({
    ...template,
    id: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: {
      en: `Instrumental ${index + 1}`,
      vi: index === 347 ? "Đàn bầu bên dòng sông" : `Nhạc không lời ${index + 1}`,
    },
    artist: "Synthetic catalogue fixture",
    status: "published",
    position: index,
    category: "instrumental",
    source: { kind: "hosted", path: "synthetic.mp3" },
    goals: ["relax"],
    genres: [index % 2 ? "folk" : "classical"],
    instruments: [index % 2 ? "strings" : "piano"],
    traditions: ["vietnamese"],
  }));
}
async function open(page: Page, locale = "en") {
  await page.goto(`/${locale}/brainwave-entrainment`);
  await expect(page.locator(".binaural-buttons button").first()).toBeEnabled();
  await expect(page.locator(".binaural-background")).toHaveCount(1);
  await page.locator(".binaural-background").scrollIntoViewIfNeeded();
  await expect(page.locator(".binaural-background .track-card")).toHaveCount(24);
}
test("all 348 recordings are reachable with bounded pages, a final page and previous navigation", async ({
  page,
}) => {
  const tracks = await catalogue();
  const requests: URLSearchParams[] = [];
  await page.route("**/api/catalog?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    return route.fulfill({
      json: paginateTracks(tracks, {
        ...Object.fromEntries(params),
        limit: Number(params.get("limit")),
        status: "published",
      }),
    });
  });
  const grants: string[] = [];
  await page.route("**/api/grants/*", (route) => {
    grants.push(new URL(route.request().url()).pathname.split("/").at(-1)!);
    return route.fulfill({
      json: { url: "/synthetic.mp3", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
  });
  await open(page);
  const section = page.locator(".binaural-background");
  await expect(section.locator(".results-note")).toHaveText("348 recordings to explore");
  const seen: string[] = [];
  for (let index = 0; index < 15; index++) {
    await expect(section.locator("fieldset")).not.toBeDisabled();
    const titles = await section.locator(".track-title").allTextContents();
    expect(titles.length).toBe(index === 14 ? 12 : 24);
    seen.push(...titles);
    if (index < 14) {
      await section.getByRole("button", { name: "Next recordings", exact: true }).click();
      await expect(section.locator(".track-title").first()).toHaveText(
        `Instrumental ${(index + 1) * 24 + 1}`,
      );
    }
  }
  expect(new Set(seen).size).toBe(348);
  expect(seen).toEqual(tracks.map((track) => track.title.en));
  expect(requests).toHaveLength(15);
  expect(requests.every((params) => params.get("limit") === "24")).toBe(true);
  await expect(section.locator(".binaural-range")).toHaveText("337-348 of 348 recordings");
  await section.locator(".card-play").last().click();
  await expect.poll(() => grants.at(-1)).toBe(tracks[347].id);
  await expect(section.locator(".card-play").last()).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("link", { name: "Back to session controls", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeInViewport();
  await section.getByRole("button", { name: "Back", exact: true }).click();
  await expect(section.locator(".track-title").first()).toHaveText("Instrumental 313");
  await expect(section.locator(".binaural-catalogue-selection")).toContainText("Instrumental 348");
  await section.getByRole("button", { name: "Next recordings", exact: true }).click();
  await expect(section.locator(".card-play").last()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "idle");
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(
    true,
  );
});

test("Explore search and every facet work in the mixer, including fast changes, empty results and retry", async ({
  page,
}) => {
  const tracks = await catalogue();
  let fail = false;
  const queries: Record<string, string>[] = [];
  await page.route("**/api/catalog?*", async (route) => {
    const query = Object.fromEntries(new URL(route.request().url()).searchParams);
    queries.push(query);
    if (fail) return route.fulfill({ status: 503, json: { error: { code: "unavailable" } } });
    if (query.genre === "classical") await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({
      json: paginateTracks(tracks, { ...query, limit: Number(query.limit), status: "published" }),
    });
  });
  await open(page);
  const section = page.locator(".binaural-background");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await section.locator(".catalog-filter-details > summary").click();
  await section.locator("#binaural-filter-goal").selectOption("relax");
  await section.locator("#binaural-filter-tradition").selectOption("vietnamese");
  await section.locator("#binaural-filter-genre").selectOption("classical");
  await section.locator("#binaural-filter-genre").selectOption("folk");
  await section.locator("#binaural-filter-instrument").selectOption("strings");
  await expect(section.locator(".results-note")).toHaveText("174 recordings to explore");
  await expect(section.locator(".track-title").first()).toHaveText("Instrumental 2");
  for (const q of ["dan bau", "Đàn bầu", "dong song"]) {
    await section.getByRole("searchbox", { name: "Search recordings", exact: true }).fill(q);
    await section.getByRole("searchbox", { name: "Search recordings", exact: true }).press("Enter");
    await expect(section.locator(".track-card")).toHaveCount(1);
    await expect(section.locator(".track-title")).toHaveText("Instrumental 348");
  }
  expect(queries.at(-1)).toMatchObject({
    q: "dong song",
    goal: "relax",
    genre: "folk",
    instrument: "strings",
    tradition: "vietnamese",
  });
  await section.getByRole("button", { name: "Nature sounds", exact: true }).click();
  await expect(
    section.getByRole("heading", { name: "No recordings found", exact: true }),
  ).toBeVisible();
  await section
    .locator(".filter-row")
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(section.locator(".results-note")).toHaveText("348 recordings to explore");
  fail = true;
  await section
    .getByRole("searchbox", { name: "Search recordings", exact: true })
    .fill("unavailable");
  await section.getByRole("searchbox", { name: "Search recordings", exact: true }).press("Enter");
  await expect(section.getByRole("alert")).toContainText("The collection is unavailable");
  fail = false;
  await section.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(section.getByRole("alert")).toHaveCount(0);
  await section
    .locator(".filter-row")
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(section.locator(".track-card")).toHaveCount(24);
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
});

for (const locale of ["en", "vi"])
  test(`expanded music catalogue is accessible and responsive in ${locale}`, async ({ page }) => {
    const tracks = await catalogue();
    await page.route("**/api/catalog?*", (route) =>
      route.fulfill({ json: paginateTracks(tracks, { limit: 24, status: "published" }) }),
    );
    await open(page, locale);
    const section = page.locator(".binaural-background");
    await section.locator(".catalog-filter-details > summary").click();
    for (const width of [390, 820, 1440, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect((await section.getByRole("searchbox").boundingBox())!.width).toBeGreaterThanOrEqual(
        140,
      );
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
      await section.screenshot({ path: `test-results/binaural-catalogue-${locale}-${width}.png` });
    }
    await section.locator(".track-actions .icon-button").last().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section.locator(".track-actions .icon-button").last()).toBeFocused();
  });
