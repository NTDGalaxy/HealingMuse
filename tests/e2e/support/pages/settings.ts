import type { Page } from "@playwright/test";
import { settings } from "../contracts";
import { pattern, t, type Locale, type MessageKey, type MessageValues } from "../i18n";

/** Settings panels, the appearance controls they host and account actions. */
export class Settings {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  /** The appearance panel, the first panel of the route. */
  get appearance() {
    return this.page.locator(settings.appearance);
  }
  /** The name and help text beside the Calm mode switch. */
  get calmText() {
    return this.appearance.locator(settings.settingText);
  }
  get calmSwitch() {
    return this.appearance.getByRole("checkbox", {
      name: pattern(this.locale, "appearance.calm"),
    });
  }
  get account() {
    return this.page.locator(settings.account);
  }
  get privacy() {
    return this.page.locator(settings.privacy);
  }
  get install() {
    return this.page.locator(settings.install);
  }
  /** The account panel's destructive action. */
  get accountDanger() {
    return this.account.getByRole("button", {
      name: this.t("settings.deleteAccount"),
      exact: true,
    });
  }
  get actionGroups() {
    return this.page.locator(settings.actions);
  }
  get guestNote() {
    return this.page.getByText(this.t("settings.guestText"), { exact: true });
  }
  get deleteAccount() {
    return this.page.getByRole("button", { name: this.t("settings.deleteAccount"), exact: true });
  }
  get confirmation() {
    return this.page.getByRole("textbox", { name: this.t("settings.confirmation") });
  }
  get confirmDelete() {
    return this.page.getByRole("button", { name: this.t("settings.confirmDelete"), exact: true });
  }
  get signOut() {
    return this.page.getByRole("button", { name: this.t("auth.signOut"), exact: true });
  }
  /** Types this language's confirmation word (XÓA or DELETE) and erases the account. */
  async deleteAccountPermanently() {
    await this.deleteAccount.click();
    await this.confirmation.fill(this.t("settings.confirmationWord"));
    await this.confirmDelete.click();
  }
}
