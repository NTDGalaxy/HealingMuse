import { expect, type Page } from "@playwright/test";
import { binaural, storage } from "../contracts";
import { pattern, t, type Locale, type MessageKey, type MessageValues } from "../i18n";
import { Explore } from "./explore";

export type BinauralMode = "alpha" | "beta" | "theta" | "delta";
type SessionButton =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "favoritePreset"
  | "reset"
  | "retryMusic"
  | "tonesOnly"
  | "none"
  | "retryEngine";

type Instrumented = typeof window & {
  binauralTestContexts: AudioContext[];
  binauralTestActions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>>;
  binauralTestMedia: HTMLMediaElement[];
};

/** The brainwave entrainment route: session controls, mixer catalogue and instrumentation. */
export class Binaural {
  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  get path() {
    return `/${this.locale}/brainwave-entrainment`;
  }

  /** Opens the route and waits for the hydrated, single (not streamed twice) player. */
  async open() {
    await this.page.goto(this.path);
    await expect(this.button("start")).toBeEnabled();
    await expect(this.player).toHaveCount(1);
  }

  /** Opens the route and waits for the mixer catalogue's first full page of recordings. */
  async openCatalogue() {
    await this.page.goto(this.path);
    await expect(this.buttons.first()).toBeEnabled();
    await expect(this.background).toHaveCount(1);
    await this.background.scrollIntoViewIfNeeded();
    await expect(this.catalogue.recordings.cards).toHaveCount(24);
  }

  get player() {
    return this.page.locator(binaural.player);
  }
  async expectState(state: string, options?: { timeout?: number }) {
    await expect(this.player).toHaveAttribute(binaural.state, state, options);
  }
  /** The session controls: start, pause or resume, and stop. */
  get buttons() {
    return this.page.locator(binaural.sessionControls).getByRole("button");
  }
  button(key: SessionButton) {
    return this.page.getByRole("button", { name: this.t(`binaural.${key}`), exact: true });
  }
  get progress() {
    return this.page.getByRole("progressbar", { name: this.t("binaural.progress") });
  }
  /** A listening mode radio, whose name begins with the mode title. */
  mode(mode: BinauralMode) {
    return this.page.getByRole("radio", {
      name: pattern(this.locale, `binaural.modes.${mode}.title`),
    });
  }
  private modes(options: { includeHidden?: boolean } = {}) {
    return this.page.getByRole("group", {
      name: this.t("binaural.chooseMode"),
      exact: true,
      ...options,
    });
  }
  /** The listening mode radios, in mode order. */
  get modeChoices() {
    return this.modes().getByRole("radio");
  }
  /**
   * The chosen mode's radio. Its decoration is also inspected under an open modal dialog, which
   * hides the page from assistive technology, so hidden elements are included.
   */
  get selectedModeInput() {
    return this.modes({ includeHidden: true }).getByRole("radio", {
      checked: true,
      includeHidden: true,
    });
  }
  get frequencies() {
    return this.page.locator(binaural.frequencies);
  }
  /** Selects and fields named by a label that also contains their current value. */
  get preset() {
    return this.page.getByRole("combobox", { name: pattern(this.locale, "binaural.preset") });
  }
  /** The button that saves the selected preset as a favourite. */
  get favoritePreset() {
    return this.page.getByRole("button", { name: this.t("binaural.favoritePreset"), exact: true });
  }
  get duration() {
    return this.page.getByRole("combobox", { name: pattern(this.locale, "binaural.duration") });
  }
  get customDuration() {
    return this.page.getByRole("spinbutton", {
      name: pattern(this.locale, "binaural.customMinutes"),
    });
  }
  volume(channel: "master" | "tone" | "background") {
    return this.page.getByRole("slider", {
      name: pattern(this.locale, `binaural.${channel}Volume`),
    });
  }
  get visualizerBar() {
    return this.page.locator(binaural.visualizerBar).first();
  }
  get advanced() {
    return this.page.locator(binaural.advanced);
  }
  get remember() {
    return this.page.getByRole("checkbox", { name: this.t("binaural.remember") });
  }
  get ordinaryMusic() {
    return this.page.getByRole("link", { name: this.t("binaural.ordinaryMusic"), exact: true });
  }
  get engineAlert() {
    return this.player.getByRole("alert");
  }

  /** The optional background music section. */
  get background() {
    return this.page.getByRole("region", {
      name: this.t("binaural.backgroundTitle"),
      exact: true,
    });
  }
  get backgroundPlay() {
    return this.catalogue.recordings.plays.first();
  }
  /** The recordings offered as background music, a group disabled while a page loads. */
  get backgroundChoices() {
    return this.background.getByRole("group", {
      name: this.t("binaural.chooseMusic"),
      exact: true,
    });
  }
  /** The mixer catalogue, which reuses Explore's search, facets and paging. */
  get catalogue() {
    return new Explore(this.page, this.locale, this.background);
  }
  get range() {
    return this.background.locator(binaural.range);
  }
  get selection() {
    return this.background.locator(binaural.selection);
  }
  get returnToSession() {
    return this.background.getByRole("link", {
      name: this.t("binaural.returnToSession"),
      exact: true,
    });
  }
  /** Saved listening preferences, present only after the listener opts in. */
  storedPreferences() {
    return this.page.evaluate((key) => localStorage.getItem(key), storage.binauralPreferences);
  }

  async visualizerAnimation() {
    return this.visualizerBar.evaluate((element) => getComputedStyle(element).animationName);
  }
  async openAdvanced() {
    await this.advanced.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
  }

  /**
   * Records every AudioContext the page creates and the Media Session handlers it registers.
   * The native constructor stays reachable for reference clocks that must not be counted.
   */
  async instrumentAudio() {
    await this.page.addInitScript(() => {
      const NativeContext = window.AudioContext;
      const contexts: AudioContext[] = [];
      Object.defineProperty(window, "binauralTestContexts", { value: contexts });
      Object.defineProperty(window, "nativeAudioContext", { value: NativeContext });
      window.AudioContext = class extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          contexts.push(this);
        }
      };
      if ("mediaSession" in navigator) {
        const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {};
        const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
        Object.defineProperty(window, "binauralTestActions", { value: handlers });
        navigator.mediaSession.setActionHandler = (action, handler) => {
          handlers[action] = handler;
          set(action, handler);
        };
      }
    });
  }
  contextStates() {
    return this.page.evaluate(() =>
      (window as Instrumented).binauralTestContexts.map((context) => context.state),
    );
  }
  async invokeMediaSession(action: MediaSessionAction) {
    await this.page.evaluate(
      (action) => (window as Instrumented).binauralTestActions[action]?.({ action }),
      action,
    );
  }

  /**
   * Holds every AudioContext resume until the returned function runs, so a binaural start stays
   * pending (status "starting"). The function releases them and returns the page-clock time.
   */
  async holdToneStart(): Promise<() => Promise<number>> {
    await this.page.addInitScript(() => {
      const resume = AudioContext.prototype.resume;
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      Object.defineProperty(window, "binauralTestReleaseResume", {
        value: () => {
          const at = performance.now();
          release();
          return at;
        },
      });
      AudioContext.prototype.resume = function (this: AudioContext) {
        return released.then(() => resume.call(this));
      };
    });
    return () =>
      this.page.evaluate(() =>
        (
          window as unknown as { binauralTestReleaseResume: () => number }
        ).binauralTestReleaseResume(),
      );
  }

  /** Records media elements routed into the mixer graph. */
  async instrumentBackgroundMedia() {
    await this.page.addInitScript(() => {
      const original = AudioContext.prototype.createMediaElementSource;
      const media: HTMLMediaElement[] = [];
      Object.defineProperty(window, "binauralTestMedia", { value: media });
      AudioContext.prototype.createMediaElementSource = function (element) {
        media.push(element);
        return original.call(this, element);
      };
    });
  }
  backgroundMediaPlaying() {
    return this.page.evaluate(() =>
      (window as Instrumented).binauralTestMedia.map((item) => !item.paused),
    );
  }
}
