import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("home discovery does not promote unavailable nature recordings", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator('#main-content a[href*="category=nature"]')).toHaveCount(0);
});

test("phone recording actions stay above fixed navigation when reached by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi");
  const card = page.locator(".track-card").first();
  await card.locator(".card-play").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const control = page.locator(":focus");
  await expect(control).toBeVisible();
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && element.contains(hit);
    }),
  ).toBe(true);
});

for (const locale of ["en", "vi"])
  for (const theme of ["day", "night"]) {
    test(`${locale} ${theme} keeps the first recording identified and immediately playable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(
        (theme) =>
          localStorage.setItem(
            "healingmuse-appearance-v1",
            JSON.stringify({ appearance: theme, garden: "still" }),
          ),
        theme,
      );
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".player-bar")).toBeHidden();
      const first = page.locator(".featured-recording .track-card");
      for (const selector of [".track-title", ".track-description p", ".card-play"]) {
        const bounds = (await first.locator(selector).boundingBox())!;
        expect(bounds.y).toBeGreaterThan(0);
        expect(bounds.y + bounds.height).toBeLessThan(
          (await page.locator(".mobile-nav").boundingBox())!.y,
        );
      }
      await expect(first.locator(".card-play-label")).toBeVisible();
      const label = await first.locator(".card-play-label").boundingBox();
      expect(label!.height).toBeLessThanOrEqual(24);
      const art = await first.locator(".track-art").boundingBox();
      const description = await first.locator(".track-description").boundingBox();
      expect(art!.x + art!.width).toBeLessThan(description!.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator(".garden-canvas canvas")).toHaveCount(0);
    });
  }

test("global appearance persists and More restores keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await page.getByRole("button", { name: "Your garden", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Appearance", { exact: true }).selectOption("night");
  await dialog.getByLabel("Garden detail", { exact: true }).selectOption("still");
  await dialog.getByRole("checkbox").check();
  await expect(page.locator(".app-shell")).toHaveClass(/calm-mode/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Your garden", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.locator(".garden-canvas canvas")).toHaveCount(0);
  const more = page.locator(".mobile-nav").getByRole("button", { name: "More", exact: true });
  await more.click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Downloads", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("dialog").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect(page.locator(".mobile-nav button")).toHaveAttribute("data-current", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("renderer startup failure leaves working recording controls and a poster", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Synthetic worker startup failure");
      }
    } as unknown as typeof Worker;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (String(args[0]).includes("webgl")) return null;
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
  });
  await page.goto("/en");
  await expect(page.locator(".garden-canvas")).toHaveAttribute("data-state", "still");
  await page.locator(".featured-recording .card-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
  await expect(page.locator(".player-bar")).toBeVisible();
});

test("the active listening queue remains readable in Night appearance", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "healingmuse-appearance-v1",
      JSON.stringify({ appearance: "night", garden: "still" }),
    ),
  );
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.locator(".featured-recording .card-play").click();
  await page.getByRole("button", { name: "Listening queue", exact: true }).click();
  await expect(page.locator('.queue-list button[aria-current="true"]')).toHaveCount(1);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".dialog-content")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await page.locator('.side-nav a[href="/en/explore"]').hover();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".sidebar")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test.describe("WebGL lifecycle", () => {
  test("sustained slow frames reduce quality and fall back without blocking audio", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "Worker", { value: undefined, configurable: true });
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => request((time) => callback(time * 20));
    });
    await page.goto("/en");
    const host = page.locator(".garden-canvas");
    await expect(host).toHaveAttribute("data-state", "still");
    await expect(host).toHaveAttribute("data-quality", "0");
    await expect(host.locator("canvas")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-garden", "auto");
    await page.locator(".featured-recording .card-play").click();
    await expect
      .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
      .toBe(true);
  });

  test("main-thread fallback and context loss preserve active audio", async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "Worker", { value: undefined, configurable: true }),
    );
    await page.goto("/en");
    const host = page.locator(".garden-canvas");
    await expect(host).toHaveAttribute("data-state", "ready");
    await expect(host).toHaveAttribute("data-renderer", "main");
    await page.locator(".featured-recording .card-play").click();
    await expect
      .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
      .toBe(true);
    await host
      .locator("canvas")
      .evaluate((canvas) =>
        (canvas as HTMLCanvasElement)
          .getContext("webgl2")!
          .getExtension("WEBGL_lose_context")!
          .loseContext(),
      );
    await expect(host).toHaveAttribute("data-state", "still");
    await expect(host.locator("canvas")).toHaveCount(0);
    await expect
      .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
      .toBe(true);
  });
});
