import type { Page } from "@playwright/test";
import { admin } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";

/** The content studio: the recording editor, the recording list and release review. */
export class Admin {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  /** The option for `value` in the recording editor's artwork colour select. */
  colorOption(value: string) {
    return this.page
      .getByLabel(this.t("admin.color"), { exact: true })
      .locator(admin.option(value));
  }
  /** The option for `value` in the recording editor's artwork style select. */
  artworkOption(value: string) {
    return this.page
      .getByLabel(this.t("admin.artwork"), { exact: true })
      .locator(admin.option(value));
  }
  get recordingStatus() {
    return this.page.locator(admin.recordingStatus);
  }
  /** The outcome line of a release under review. */
  get releaseStatus() {
    return this.page
      .getByRole("region", { name: this.t("admin.release.title"), exact: true })
      .getByRole("status");
  }
}
