import type { Page } from "@playwright/test";
import { mood } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";

export type MoodScore = 1 | 2 | 3 | 4 | 5;

/** Private check-ins: the mood scale of the check-in dialogs and the mood history route. */
export class Mood {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  /** The recent days' averages, a region named by its heading. */
  get trends() {
    return this.page.getByRole("region", { name: this.t("mood.trendTitle"), exact: true });
  }
  /** One step of the mood scale, by its text. */
  score(score: MoodScore) {
    return this.page.getByRole("radio", { name: this.t(`mood.score${score}`), exact: true });
  }
  /** Every step of the visible mood scale, as the listener sees and taps it. */
  get scoreChoices() {
    return this.page.locator(mood.score);
  }
}
