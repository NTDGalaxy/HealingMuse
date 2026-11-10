import type { Page } from "@playwright/test";
import { player } from "../contracts";
import { escapeRegExp, t, type Locale, type MessageKey, type MessageValues } from "../i18n";

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

  /** The player bar, also while it is hidden because nothing plays. */
  get bar() {
    return this.page.locator(player.bar);
  }
  /** The playback error the bar shows, with its retry control. */
  get error() {
    return this.bar.getByRole("alert");
  }
  get currentTitle() {
    return this.page.locator(player.currentTitle);
  }
  /** The play or pause control in the bar, whichever it currently offers. */
  get playButton() {
    const names = [this.t("player.play"), this.t("player.pause")].map(escapeRegExp);
    return this.bar.getByRole("button", { name: new RegExp(`^(${names.join("|")})$`) });
  }
  /** The entries of the open queue dialog, in queue order. */
  get queueItems() {
    return this.page.getByRole("dialog").getByRole("list").getByRole("button");
  }
  get currentQueueItem() {
    return this.queueItems.and(this.page.locator(player.current));
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
    return this.page.getByRole("status").filter({ hasText: this.t("player.timerEnded") });
  }
  /** The embedded video frame of an external recording, named after the recording. */
  video(title: string) {
    return this.page.getByTitle(title, { exact: true });
  }
}
