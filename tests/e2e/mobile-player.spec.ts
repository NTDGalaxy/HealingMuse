import {
  test,
  expect,
  expectNoHorizontalOverflow,
  expectPlaying,
  expectSeen,
  expectTapLandsOn,
  expectUnseen,
  seedDownload,
} from "./support/test";
import type { Locator, Page } from "@playwright/test";
import { paginateTracks } from "../../src/lib/catalog-query";
import { preparedCatalogue, syntheticCatalogue } from "./support/catalogue";
import {
  catalogRoute,
  layout,
  localAudioPath,
  shell as shellParts,
  size,
  style,
} from "./support/contracts";
import { Binaural, Player, Recordings, Shell, TrackCard } from "./support/pages";

const fill = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/** Every line's Play is seen, a full-size target, and an opaque badge that a tap reaches. */
async function expectPlayableLines(cards: Locator) {
  // Streamed content may still sit in Next's hidden copy just after navigation.
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count, "recording lines").toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const card = new TrackCard(cards.nth(index));
    await expectSeen(card.play);
    const box = (await card.play.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(size.touchTarget);
    expect(box.height).toBeGreaterThanOrEqual(size.touchTarget);
    expect(await fill(card.playIcon)).toMatch(style.opaque);
    await expectTapLandsOn(card.playIcon, card.play);
  }
}

/**
 * A narrow line keeps room for the name: download and favourite (unless saved) fold into the
 * details sheet, leaving details as the line's only visible action.
 */
async function expectRoomyNarrowLines(cards: Locator) {
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count, "recording lines").toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const card = new TrackCard(cards.nth(index));
    expect((await card.title.boundingBox())!.width).toBeGreaterThanOrEqual(size.lineTitleMin);
    await expect(card.favorite).toBeHidden();
    await expect(card.actionIconButtons.filter({ visible: true })).toHaveCount(1);
  }
}

/** Under reduced transparency a touch cover stays clear: only the badge is painted, solid. */
async function expectClearCoverWhenSolid(page: Page, card: TrackCard) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ ...style.reducedTransparency }] });
  expect(await fill(card.play)).toBe(style.transparent);
  expect(await fill(card.playIcon)).toMatch(style.opaque);
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await cdp.detach();
}

test.describe("on a touch phone", () => {
  // A touch screen has no hover, so nothing may wait for one to reveal how to listen.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("every recording line shows a Play badge a tap reaches, without hover", async ({ page }) => {
    const recordings = new Recordings(page, "vi");
    await page.goto("/vi");
    const upNext = recordings.moreCards.filter({ visible: true });
    await expectPlayableLines(upNext);
    await expectClearCoverWhenSolid(page, new TrackCard(upNext.first()));
    await page.goto("/vi/explore");
    await expectPlayableLines(recordings.mainCards);
    const first = new TrackCard(recordings.mainCards.first());
    await expectClearCoverWhenSolid(page, first);
    await first.play.tap();
    await expectPlaying(page);
  });

  test("narrow lines keep room for the name on a small phone and in the Binaural picker", async ({
    page,
  }) => {
    const recordings = new Recordings(page, "vi");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/vi");
    await expectRoomyNarrowLines(recordings.moreCards.filter({ visible: true }));
    await page.goto("/vi/explore");
    await expectRoomyNarrowLines(recordings.mainCards);
    // At full phone width the picker is narrow too: it sits inside a padded card. Its catalogue is
    // routed so a full page exists in CI, with one recording the mixer cannot play under tones.
    const tracks = await syntheticCatalogue(30, (track, index) =>
      index === 1
        ? { ...track, source: { kind: "youtube", videoId: "synthetic01" }, downloadAllowed: false }
        : track,
    );
    await page.route(catalogRoute, (route) => {
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({
        json: paginateTracks(tracks, {
          ...Object.fromEntries(params),
          limit: Number(params.get("limit")),
          status: "published",
        }),
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const binaural = new Binaural(page, "vi");
    await binaural.openCatalogue();
    await expectRoomyNarrowLines(binaural.catalogue.recordings.cards);
    // A recording that cannot be mixed looks unavailable, not like the others.
    const unmixable = new TrackCard(binaural.catalogue.recordings.cards.nth(1)).play;
    await expect(unmixable).toBeDisabled();
    expect(await unmixable.evaluate((element) => getComputedStyle(element).opacity)).toBe(
      style.dimmed,
    );
  });

  test("a keyboard focus ring on a line is drawn inside its cover", async ({ page }) => {
    const recordings = new Recordings(page, "vi");
    await page.goto("/vi/explore");
    const play = new TrackCard(recordings.mainCards.first()).play;
    await page.keyboard.press("Tab");
    await play.focus();
    // The cover clips what lies outside it, so the ring must sit within Play's own box.
    const ring = await play.evaluate((element, focusVisible) => {
      const computed = getComputedStyle(element);
      return {
        focusVisible: element.matches(focusVisible),
        style: computed.outlineStyle,
        reach: parseFloat(computed.outlineOffset) + parseFloat(computed.outlineWidth),
      };
    }, shellParts.focusVisible);
    expect(ring.focusVisible).toBe(true);
    expect(ring.style).not.toBe(style.none);
    expect(ring.reach).toBeLessThanOrEqual(0);
  });

  test("a downloaded line keeps its check clear of Play, and Downloads lists lines", async ({
    page,
  }) => {
    const recordings = new Recordings(page, "vi");
    await page.goto("/vi/explore");
    const line = new TrackCard(recordings.mainCards.first());
    const title = (await line.title.textContent())!.trim();
    const track = (await preparedCatalogue()).find((item) => item.title.vi === title)!;
    expect(track.source.kind, "a downloadable recording").toBe("hosted");
    await seedDownload(page, track, localAudioPath(track.id));
    await page.reload();
    await expectSeen(line.downloaded);
    const check = (await line.downloaded.boundingBox())!;
    const badge = (await line.playIcon.boundingBox())!;
    const apart =
      check.x + check.width <= badge.x ||
      badge.x + badge.width <= check.x ||
      check.y + check.height <= badge.y ||
      badge.y + badge.height <= check.y;
    expect(apart, "the check and the Play badge do not overlap").toBe(true);
    await expectTapLandsOn(line.playIcon, line.play);
    // The check is a mark, not a control: a tap on it still plays.
    await expectTapLandsOn(line.downloaded, line.play);
    await page.goto("/vi/downloads");
    const saved = new TrackCard(recordings.mainCards.first());
    await expectSeen(saved.downloaded);
    expect((await saved.art.boundingBox())!.width).toBe(size.lineCover);
    await expectPlayableLines(recordings.mainCards);
    await saved.play.tap();
    await expectPlaying(page);
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`a pointer reveals a line's Play by hovering it at ${viewport.width}px`, async ({
    page,
  }) => {
    const recordings = new Recordings(page, "vi");
    await page.setViewportSize(viewport);
    await page.goto("/vi");
    const row = new TrackCard(recordings.moreCards.filter({ visible: true }).first());
    await expectUnseen(row.play);
    await row.root.hover();
    await expectSeen(row.play);
    if (viewport.width > layout.phoneMaxWidth) return;
    await page.goto("/vi/explore");
    const line = new TrackCard(recordings.mainCards.first());
    await expectUnseen(line.play);
    await line.root.hover();
    await expectSeen(line.play);
  });
}
for (const width of [1024, 1120]) {
  test(`Home beside a large cover fits at ${width}px: up next folds, nothing reaches past the edge`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/vi");
    const recordings = new Recordings(page, "vi");
    await expectRoomyNarrowLines(recordings.moreCards.filter({ visible: true }));
    await expectNoHorizontalOverflow(page);
    // The featured Listen and its actions keep one line in the narrow column.
    const listen = (await recordings.featured.play.boundingBox())!;
    const favorite = (await recordings.featured.favorite.boundingBox())!;
    expect(favorite.y).toBeGreaterThanOrEqual(listen.y);
    expect(favorite.y + favorite.height).toBeLessThanOrEqual(listen.y + listen.height);
  });
}
test("the phone player exposes its complete keyboard-operable controls", async ({ page }) => {
  const shell = new Shell(page);
  const player = new Player(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/en");
  await new Recordings(page).featuredPlay.click();
  await player.button("expand").click();
  for (const key of ["previous", "next", "repeat", "queue", "finish"] as const) {
    const button = player.button(key);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(size.touchTarget);
    expect(box!.height).toBeGreaterThanOrEqual(size.touchTarget);
  }
  await player.button("queue").click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(player.button("queue")).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`a playing recording's player covers no page content at ${viewport.width}px`, async ({
    page,
  }) => {
    const shell = new Shell(page, "vi");
    const player = new Player(page, "vi");
    const recordings = new Recordings(page, "vi");
    await page.setViewportSize(viewport);
    await page.goto("/vi");
    await recordings.featuredPlay.click();
    await expectPlaying(page);
    await expect(player.bar).toBeVisible();
    const playerTop = (await player.bar.boundingBox())!.y;
    const bottomOf = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height;
    };
    if (await shell.sidebar.isVisible()) {
      // The foot of the sidebar stays above the player bar.
      for (const key of ["privacy", "terms", "credits"] as const)
        expect(await bottomOf(shell.sidebarLegalLink(key))).toBeLessThanOrEqual(playerTop);
    } else {
      // The first recording up next stays in the first view above the mini player.
      expect(await bottomOf(recordings.moreCards.first())).toBeLessThanOrEqual(playerTop);
    }
    // The end of the page scrolls clear of the player.
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await expect.poll(() => bottomOf(shell.pageFooter)).toBeLessThanOrEqual(playerTop);
  });
}
