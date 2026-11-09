import type { Page } from "@playwright/test";
import { accountDeletionConfirmation, settings, shell } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";

/** Settings panels, the appearance controls they host and account actions. */
export class Settings {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  get panels() {
    return this.page.locator(shell.panel);
  }
  /** The Calm mode row inside the appearance controls. */
  get appearanceRow() {
    return this.page.locator(settings.appearanceRow);
  }
  get appearanceRowLabel() {
    return this.appearanceRow.locator(settings.rowLabel).first();
  }
  get appearanceRowControl() {
    return this.appearanceRow.locator(settings.rowControl);
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
  get accountDanger() {
    return this.page.locator(settings.accountDanger);
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
  async deleteAccountPermanently() {
    await this.deleteAccount.click();
    await this.confirmation.fill(accountDeletionConfirmation);
    await this.confirmDelete.click();
  }
}
