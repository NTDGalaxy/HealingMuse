import { expect, type Page } from "@playwright/test";
import { documentRoot, garden, shell } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";
import type { GardenDetail, Theme } from "../test";

type SideNavRoute = "explore" | "binaural" | "downloads" | "settings";

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
    return this.page.getByRole("main");
  }
  /** The route heading inside the reading region, never Next's hidden streamed copy. */
  get mainHeading() {
    return this.main.getByRole("heading", { level: 1 });
  }
  /** Paragraphs of the reading region that are rendered and exposed. */
  get mainCopy() {
    return this.main.getByRole("paragraph");
  }
  get pageHeading() {
    return this.page.locator(shell.pageHeading);
  }
  get skipLink() {
    return this.page.getByRole("link", { name: this.t("nav.skip"), exact: true });
  }
  get topbar() {
    return this.page.getByRole("banner");
  }
  get sidebar() {
    return this.page.locator(shell.sidebar);
  }
  /** A legal link at the foot of the desktop sidebar, by its message key under `nav`. */
  sidebarLegalLink(key: "privacy" | "terms" | "credits") {
    return this.sidebar.getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  /** The contentinfo landmark that closes every page, after the main region. */
  get pageFooter() {
    return this.page.getByRole("contentinfo");
  }
  /** Every search form; Home and Explore each render one. */
  get searchField() {
    return this.page.locator(shell.searchField);
  }
  get scenery() {
    return this.page.locator(shell.scenery);
  }
  get emptyState() {
    return this.page.locator(shell.emptyState);
  }
  /** Body copy and setting help that must stay at a readable size. */
  get readableText() {
    return this.mainCopy.or(this.page.locator(shell.settingHelp));
  }
  get focused() {
    return this.page.locator(shell.focused);
  }
  get mobileNav() {
    return this.page.locator(shell.mobileNav);
  }
  /** The text labels of the phone tabs, in order. */
  get mobileNavLabels() {
    return this.mobileNav.locator(shell.navLabel);
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
    return this.gardenHost.locator(garden.canvas);
  }

  /** A primary navigation link by its message key under `nav`. */
  navLink(key: "explore" | "downloads" | "settings") {
    return this.page.getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  /** A navigation link inside the open More dialog. */
  dialogNavLink(key: "downloads" | "settings") {
    return this.dialog.getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  /** A destination in the desktop sidebar's navigation, by its message key under `nav`. */
  sideNavLink(key: SideNavRoute) {
    return this.sidebar
      .getByRole("navigation", { name: this.t("nav.label"), exact: true })
      .getByRole("link", { name: this.t(`nav.${key}`), exact: true });
  }
  /** The live download progress line shown while a recording is being saved. */
  get downloadStatus() {
    return this.page.locator(shell.downloadStatus);
  }
  get downloadProgress() {
    return this.downloadStatus.getByRole("status");
  }
  /** The visual confirmation toast (its text is also announced through the live region). */
  get toast() {
    return this.page.locator(shell.toast);
  }
  /** Every link that switches to `locale`: the top bar's, and the Settings panel's there. */
  languageLink(locale: Locale) {
    return this.page.getByRole("link").and(this.page.locator(shell.languageLink(locale)));
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
  /** Turns Calm on or off from the appearance dialog and waits until the shell follows. */
  async setCalm(on: boolean) {
    await this.gardenButton.click();
    await this.dialog.getByRole("checkbox").setChecked(on);
    await this.page.keyboard.press("Escape");
    if (on) await this.expectCalm();
    else await expect(this.app).not.toHaveClass(new RegExp(shell.calmClass));
  }
  async expectCalm() {
    await expect(this.app).toHaveClass(new RegExp(shell.calmClass));
  }
  /** Applies the Calm class directly, as the stored preference does after hydration. */
  async applyCalmClass() {
    await this.app.evaluate((element, name) => element.classList.add(name), shell.calmClass);
  }
  async expectCurrentMoreButton() {
    await expect(this.moreButton).toHaveAttribute(shell.current, "true");
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
}
