import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "healingmuse-appearance-v1",
      JSON.stringify({ appearance: "day", garden: "still" }),
    ),
  );
});

test("route and reused catalogue results arrive without moving listening targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await page.locator(".featured-recording .card-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
  await page.evaluate(() => {
    const state = window as typeof window & {
      originalAudio?: HTMLAudioElement;
      arrivals?: string[];
    };
    state.originalAudio = document.querySelector("audio")!;
    state.arrivals = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (
          target.matches(".track-card") &&
          target.style.opacity &&
          Number(target.style.opacity) < 0.99
        )
          state.arrivals!.push(target.className);
      }
    }).observe(document.getElementById("main-content")!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  });
  await page.locator(".mobile-nav").getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  expect(
    await page
      .locator(".page-heading")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("heading-arrive");
  await expect(page.locator(".page-heading")).not.toHaveAttribute("style", /transform|opacity/);
  expect(
    await page.evaluate(() => {
      const audio = document.querySelector("audio")!;
      return (
        audio === (window as typeof window & { originalAudio: HTMLAudioElement }).originalAudio &&
        !audio.paused
      );
    }),
  ).toBe(true);
  await page.waitForTimeout(650);
  await page.evaluate(() => ((window as typeof window & { arrivals: string[] }).arrivals = []));
  const title = await page.locator(".track-title").first().textContent();
  await page.locator(".filter-chip").nth(1).click();
  await expect(page).toHaveURL(/category=instrumental/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { arrivals: string[] }).arrivals.some((value) =>
          value.includes("track-card"),
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".track-title").first()).toHaveText(title!);
  await expect
    .poll(() =>
      page
        .locator(".track-card")
        .first()
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");
  await page.waitForTimeout(650);
  await expect(page.locator(".track-card").first()).not.toHaveAttribute(
    "style",
    /opacity|transform/,
  );
});

test("dialog entrances and exits keep repeated keyboard focus restoration", async ({ page }) => {
  await page.goto("/en");
  const details = page.locator(".featured-recording .track-actions button").last();
  for (const trigger of [
    details,
    page.getByRole("button", { name: "Your garden", exact: true }),
    details,
  ]) {
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "dialog-arrive",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await details.click();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
});

test("later phone cards rise while the first listening target stays stationary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const moves: string[] = [];
    (window as typeof window & { cardMoves: string[] }).cardMoves = moves;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (!target.matches(".track-card") || !target.style.transform) continue;
        if (Math.abs(new DOMMatrixReadOnly(getComputedStyle(target).transform).m42) > 1)
          moves.push(target.closest(".featured-recording") ? "first" : "later");
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"] });
  });
  await page.goto("/vi");
  await page.waitForTimeout(650);
  await page.locator(".home-more-recordings .track-card").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { cardMoves: string[] }).cardMoves.includes("later"),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      (window as typeof window & { cardMoves: string[] }).cardMoves.includes("first"),
    ),
  ).toBe(false);
});

for (const preference of ["calm", "reduced"] as const) {
  test(`${preference} stops page, dialog and selection decoration`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (preference === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.addInitScript(() => localStorage.setItem("healingmuse-calm", "true"));
    await page.goto("/en/brainwave-entrainment");
    await page.locator(".binaural-mode").nth(2).click();
    const more = page.locator(".mobile-nav button");
    await more.hover();
    const resting = await more.boundingBox();
    await page.mouse.down();
    expect(await more.boundingBox()).toEqual(resting);
    await page.mouse.up();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Your garden", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "none",
    );
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await close.hover();
    await page.mouse.down();
    expect(await close.evaluate((element) => getComputedStyle(element).scale)).toBe("none");
    await page.mouse.up();
    // A held-pointer probe checks :active, not click dispatch after a layout/focus update.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Your garden", exact: true }).click();
    expect(
      await page
        .locator(".binaural-mode.selected input")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.keyboard.press("Escape");
    expect(
      await page.locator(".page-heading").evaluate((element) => element.getAttribute("style")),
    ).toBeNull();
  });
}

test("glass remains readable in both themes and becomes opaque with reduced transparency", async ({
  page,
}) => {
  for (const theme of ["day", "night"]) {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "healingmuse-appearance-v1",
          JSON.stringify({ appearance: theme, garden: "still" }),
        ),
      theme,
    );
    await page.goto("/en/settings");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const panel = page.locator(".panel").first();
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(
      /^rgba\(/,
    );
    await page.waitForTimeout(650);
    expect((await new AxeBuilder({ page }).include("#main-content").analyze()).violations).toEqual(
      [],
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(
      /^rgb\(/,
    );
    expect(
      await page
        .locator(".sidebar")
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe("none");
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.detach();
  }
});

test("phone Calm and secondary recording labels remain attached to their controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/settings");
  const row = page.locator(".appearance-controls .setting-row");
  const text = (await row.locator("span").first().boundingBox())!;
  const checkbox = (await row.locator("input").boundingBox())!;
  expect(checkbox.y).toBeLessThan(text.y + text.height);
  expect(checkbox.x).toBeGreaterThan(text.x + text.width);
  await page.goto("/vi");
  for (const label of await page.locator(".home-more-recordings .card-play-label").all())
    expect((await label.boundingBox())!.height).toBeLessThanOrEqual(24);
});
