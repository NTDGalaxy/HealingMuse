import type { Locator, Page } from "@playwright/test";
import { card } from "../contracts";
import { composed, t, type Locale, type MessageKey, type MessageValues } from "../i18n";

/** One recording card and the parts listeners rely on. */
export class TrackCard {
  constructor(readonly root: Locator) {}

  get play() {
    return this.root.locator(card.play);
  }
  get playLabel() {
    return this.root.locator(card.playLabel);
  }
  get title() {
    return this.root.locator(card.title);
  }
  get description() {
    return this.root.locator(card.description);
  }
  get artist() {
    return this.root.locator(card.artist);
  }
  get art() {
    return this.root.locator(card.art);
  }
  /** The favourite, download and details buttons. */
  get actionIconButtons() {
    return this.root.locator(card.actions).getByRole("button");
  }
}

/**
 * Recording cards across a page or a catalogue section. Home renders the featured card
 * twice while streaming, so featured lookups only consider the visible copy.
 */
export class Recordings {
  constructor(
    readonly scope: Page | Locator,
    readonly locale: Locale = "en",
  ) {}

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  /** The first listening target on Home. */
  get featured() {
    return new TrackCard(
      this.scope.locator(card.featured).filter({ visible: true }).locator(card.root),
    );
  }
  get featuredPlay() {
    return this.featured.play;
  }
  get featuredActionButtons() {
    return this.featured.actionIconButtons;
  }
  get moreCards() {
    return this.scope.locator(card.more).locator(card.root);
  }
  get morePlayLabels() {
    return this.scope.locator(card.more).locator(card.playLabel);
  }
  get cards() {
    return this.scope.locator(card.root);
  }
  get visibleCards() {
    return this.cards.filter({ visible: true });
  }
  get titles() {
    return this.scope.locator(card.title);
  }
  get plays() {
    return this.scope.locator(card.play);
  }
  /** Play buttons in the main reading region, excluding Next's hidden streamed copy. */
  get mainPlays() {
    return this.scope.getByRole("main").locator(card.play);
  }
  get actionIconButtons() {
    return this.scope.locator(card.actions).getByRole("button");
  }
  /** The badges of recordings saved on this device, named by their tooltip. */
  get downloadedBadges() {
    return this.scope.getByTitle(this.t("catalog.downloaded"), { exact: true });
  }
  card(index: number) {
    return new TrackCard(this.cards.nth(index));
  }

  listen(title: string) {
    return this.scope.getByRole("button", {
      name: t(this.locale, "catalog.playTitle", { title }),
      exact: true,
    });
  }
  download(title: string) {
    return this.scope.getByRole("button", {
      name: t(this.locale, "catalog.download", { title }),
      exact: true,
    });
  }
  favorite(title: string) {
    return this.scope.getByRole("button", {
      name: t(this.locale, "catalog.favorite", { title }),
      exact: true,
    });
  }
  details(title: string) {
    return this.scope.getByRole("button", {
      name: composed.recordingDetails(this.locale, title),
      exact: true,
    });
  }
  removeDownload(title: string) {
    return this.scope.getByRole("button", {
      name: composed.removeDownload(this.locale, title),
      exact: true,
    });
  }
  heading(title: string) {
    return this.scope.getByRole("heading", { name: title, exact: true });
  }
}
