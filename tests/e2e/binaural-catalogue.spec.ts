import {
  test,
  expect,
  expectAccessible,
  expectNoHorizontalOverflow,
  isPaused,
} from "./support/test";
import { paginateTracks } from "../../src/lib/catalog-query";
import type { Track } from "@/lib/types";
import { syntheticCatalogue } from "./support/catalogue";
import { Binaural } from "./support/pages";

/** The production-sized catalogue; the last recording has a diacritic-rich Vietnamese name. */
function catalogue(): Promise<Track[]> {
  return syntheticCatalogue(348, (track, index) =>
    index === 347 ? { ...track, title: { ...track.title, vi: "Đàn bầu bên dòng sông" } } : track,
  );
}
test("all 348 recordings are reachable with bounded pages, a final page and previous navigation", async ({
  page,
}) => {
  const binaural = new Binaural(page);
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
  await binaural.openCatalogue();
  const section = binaural.catalogue;
  await expect(section.resultsNote).toHaveText(section.results(348));
  const seen: string[] = [];
  for (let index = 0; index < 15; index++) {
    await expect(binaural.backgroundChoices).not.toBeDisabled();
    const titles = await section.recordings.titles.allTextContents();
    expect(titles.length).toBe(index === 14 ? 12 : 24);
    seen.push(...titles);
    if (index < 14) {
      await section.nextPage.click();
      await expect(section.recordings.titles.first()).toHaveText(
        `Instrumental ${(index + 1) * 24 + 1}`,
      );
    }
  }
  expect(new Set(seen).size).toBe(348);
  expect(seen).toEqual(tracks.map((track) => track.title.en));
  expect(requests).toHaveLength(15);
  expect(requests.every((params) => params.get("limit") === "24")).toBe(true);
  await expect(binaural.range).toHaveText(
    binaural.t("binaural.pageRange", { start: 337, end: 348, total: 348 }),
  );
  await section.recordings.plays.last().click();
  await expect.poll(() => grants.at(-1)).toBe(tracks[347].id);
  await expect(section.recordings.plays.last()).toHaveAttribute("aria-pressed", "true");
  await binaural.returnToSession.click();
  await expect(binaural.button("start")).toBeInViewport();
  await section.previousPage.click();
  await expect(section.recordings.titles.first()).toHaveText("Instrumental 313");
  await expect(binaural.selection).toContainText("Instrumental 348");
  await section.nextPage.click();
  await expect(section.recordings.plays.last()).toHaveAttribute("aria-pressed", "true");
  await binaural.expectState("idle");
  expect(await isPaused(page)).toBe(true);
});

test("Explore search and every facet work in the mixer, including fast changes, empty results and retry", async ({
  page,
}) => {
  const binaural = new Binaural(page);
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
  await binaural.openCatalogue();
  const section = binaural.catalogue;
  await binaural.button("start").click();
  await section.filterSummary.click();
  await section.facet("goal").selectOption("relax");
  await section.facet("tradition").selectOption("vietnamese");
  await section.facet("genre").selectOption("classical");
  await section.facet("genre").selectOption("folk");
  await section.facet("instrument").selectOption("strings");
  await expect(section.resultsNote).toHaveText(section.results(174));
  await expect(section.recordings.titles.first()).toHaveText("Instrumental 2");
  for (const q of ["dan bau", "Đàn bầu", "dong song"]) {
    await section.searchFor(q, { exact: true });
    await expect(section.recordings.cards).toHaveCount(1);
    await expect(section.recordings.titles).toHaveText("Instrumental 348");
  }
  expect(queries.at(-1)).toMatchObject({
    q: "dong song",
    goal: "relax",
    genre: "folk",
    instrument: "strings",
    tradition: "vietnamese",
  });
  await section.category("nature").click();
  await expect(section.noResults).toBeVisible();
  await section.clearFilters.click();
  await expect(section.resultsNote).toHaveText(section.results(348));
  fail = true;
  await section.searchFor("unavailable", { exact: true });
  await expect(section.alert).toContainText(section.t("catalog.unavailable"));
  fail = false;
  await section.retry.click();
  await expect(section.alert).toHaveCount(0);
  await section.clearFilters.click();
  await expect(section.recordings.cards).toHaveCount(24);
  await binaural.expectState("playing");
});

for (const locale of ["en", "vi"] as const)
  test(`expanded music catalogue is accessible and responsive in ${locale}`, async ({ page }) => {
    const binaural = new Binaural(page, locale);
    const tracks = await catalogue();
    await page.route("**/api/catalog?*", (route) =>
      route.fulfill({ json: paginateTracks(tracks, { limit: 24, status: "published" }) }),
    );
    await binaural.openCatalogue();
    const section = binaural.catalogue;
    await section.filterSummary.click();
    for (const width of [390, 820, 1440, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect((await section.anySearchbox.boundingBox())!.width).toBeGreaterThanOrEqual(140);
      await expectNoHorizontalOverflow(page);
      await expectAccessible(page);
      await binaural.background.screenshot({
        path: `test-results/binaural-catalogue-${locale}-${width}.png`,
      });
    }
    await section.recordings.actionIconButtons.last().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section.recordings.actionIconButtons.last()).toBeFocused();
  });
