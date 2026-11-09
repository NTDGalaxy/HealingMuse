import { expect, type Page } from "@playwright/test";
import { documentRoot, garden, shell, status } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";
import type { GardenDetail, Theme } from "../test";

/** The persistent application chrome: navigation, appearance, dialogs and the garden. */
export class Shell {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  get document() {
    return this.page.locator(documentRoot.selector);
  }
  get app() {
    return this.page.locator(shell.app);
  }
  get main() {
    return this.page.locator(shell.main);
  }
  /** The route heading inside the reading region, never Next's hidden streamed copy. */
  get mainHeading() {
    return this.page.locator(shell.mainHeading);
  }
  get mainCopy() {
    return this.page.locator(shell.mainCopy);
  }
  get pageHeading() {
    return this.page.locator(shell.pageHeading);
  }
  get skipLink() {
    return this.page.locator(shell.skipLink);
  }
  get topbar() {
    return this.page.locator(shell.topbar);
  }
  get sidebar() {
    return this.page.locator(shell.sidebar);
  }
  get searchBox() {
    return this.page.locator(shell.searchBox);
  }
  get scenery() {
    return this.page.locator(shell.scenery);
  }
  get emptyState() {
    return this.page.locator(shell.emptyState);
  }
  get panels() {
    return this.page.locator(shell.panel);
  }
  get readableText() {
    return this.page.locator(shell.readableText);
  }
  get focused() {
    return this.page.locator(shell.focused);
  }
  get mobileNav() {
    return this.page.locator(shell.mobileNav);
  }
  get mobileNavButton() {
    return this.page.locator(shell.mobileNavButton);
  }
  get moreButton() {
    return this.mobileNav.getByRole("button", { name: this.t("common.more"), exact: true });
  }
  get gardenButton() {
    return this.page.getByRole("button", { name: this.t("appearance.title"), exact: true });
  }
  get signInButton() {
    return this.page.getByRole("button", { name: this.t("nav.signIn"), exact: true });
  }
  get dialog() {
    return this.page.getByRole("dialog");
  }
  get appearanceSelect() {
    return this.dialog.getByLabel(this.t("appearance.theme"), { exact: true });
  }
  get gardenDetailSelect() {
    return this.dialog.getByLabel(this.t("appearance.garden"), { exact: true });
  }
  get gardenHost() {
    return this.page.locator(garden.host);
  }
  /** The live WebGL canvas; absent whenever the still poster is shown. */
  get gardenCanvas() {
    return this.page.locator(garden.hostCanvas);
  }

  /** A primary navigation link by its message key under `nav`. */
  navLink(key: "explore" | "downloads" | "settings") {
    return this.page.getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  /** A navigation link inside the open More dialog. */
  dialogNavLink(key: "downloads" | "settings") {
    return this.dialog.getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  sideNavLink(href: string) {
    return this.page.locator(shell.sideNavLink(href));
  }
  /** The live download progress line shown while a recording is being saved. */
  get downloadStatus() {
    return this.page.locator(shell.downloadStatus);
  }
  get downloadProgress() {
    return this.downloadStatus.locator(status);
  }
  /** The visual confirmation toast (its text is also announced through the live region). */
  get toast() {
    return this.page.locator(shell.toast);
  }
  languageLink(locale: Locale) {
    return this.page.locator(shell.languageLink(locale));
  }

  async expectTheme(theme: Theme) {
    await expect(this.document).toHaveAttribute(documentRoot.theme, theme);
  }
  async expectLang(locale: Locale) {
    await expect(this.document).toHaveAttribute(documentRoot.lang, locale);
  }
  async expectGardenDetail(detail: GardenDetail) {
    await expect(this.document).toHaveAttribute(documentRoot.garden, detail);
  }
  async expectCalm() {
    await expect(this.app).toHaveClass(new RegExp(shell.calmClass));
  }
  /** Applies the Calm class directly, as the stored preference does after hydration. */
  async applyCalmClass() {
    await this.app.evaluate((element, name) => element.classList.add(name), shell.calmClass);
  }
  async expectCurrentMoreButton() {
    await expect(this.mobileNavButton).toHaveAttribute(shell.current, "true");
  }
  async expectGardenState(state: string) {
    await expect(this.gardenHost).toHaveAttribute(garden.state, state);
  }
  async expectGardenQuality(quality: string) {
    await expect(this.gardenHost).toHaveAttribute(garden.quality, quality);
  }
  async expectGardenRenderer(renderer: string) {
    await expect(this.gardenHost).toHaveAttribute(garden.renderer, renderer);
  }
  /** The canvas inside the garden host, for context-loss checks. */
  get gardenHostCanvas() {
    return this.gardenHost.locator(garden.canvas);
  }
}
