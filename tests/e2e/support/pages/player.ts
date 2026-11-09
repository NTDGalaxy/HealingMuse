import type { Page } from "@playwright/test";
import { player, status } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";

type PlayerButton = "timer" | "expand" | "previous" | "next" | "repeat" | "queue" | "finish";

/** The persistent player bar, its dialogs and recovery controls. */
export class Player {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  get bar() {
    return this.page.locator(player.bar);
  }
  get error() {
    return this.page.locator(player.error);
  }
  get errorAlert() {
    return this.page.locator(player.errorAlert);
  }
  get currentTitle() {
    return this.page.locator(player.currentTitle);
  }
  get playButton() {
    return this.page.locator(player.playButton);
  }
  get currentQueueItem() {
    return this.page.locator(player.currentQueueItem);
  }
  get seek() {
    return this.page.getByRole("slider", { name: this.t("player.seek") });
  }
  /** A player control by its message key under `player`. */
  button(key: PlayerButton) {
    return this.page.getByRole("button", { name: this.t(`player.${key}`), exact: true });
  }
  get retry() {
    return this.page.getByRole("button", { name: this.t("common.retry"), exact: true });
  }
  timerOption(minutes: number) {
    return this.page.getByRole("button", {
      name: this.t("common.minutes", { count: minutes }),
      exact: true,
    });
  }
  activeTimer(minutes: number) {
    return this.page.getByRole("button", { name: this.t("player.timerActive", { minutes }) });
  }
  get timerEnded() {
    return this.page.locator(status).filter({ hasText: this.t("player.timerEnded") });
  }
}
