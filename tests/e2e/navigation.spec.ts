import { test, expect, currentTime, expectPlaying } from "./support/test";
import { recordings as prepared } from "./support/contracts";
import { Recordings, Shell } from "./support/pages";
test("switching language preserves the native listening session", async ({ page }) => {
  await page.goto("/en");
  await new Recordings(page).listen(prepared.first.title.en).click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
  await new Shell(page).languageLink("vi").first().click();
  await expect(page).toHaveURL(/\/vi$/);
  await new Shell(page, "vi").expectLang("vi");
  await expectPlaying(page, { beyond: 1 });
});
