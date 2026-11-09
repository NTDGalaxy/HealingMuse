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
  get descriptionText() {
    return this.root.locator(card.descriptionText);
  }
  get art() {
    return this.root.locator(card.art);
  }
  get actionIconButtons() {
    return this.root.locator(card.actionIconButton);
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
    return new TrackCard(this.scope.locator(card.featuredCard));
  }
  get featuredPlay() {
    return this.scope.locator(card.featuredPlay);
  }
  get featuredActionButtons() {
    return this.scope.locator(card.featuredActionButton);
  }
  get moreCards() {
    return this.scope.locator(card.moreCard);
  }
  get morePlayLabels() {
    return this.scope.locator(card.morePlayLabel);
  }
  get cards() {
    return this.scope.locator(card.root);
  }
  get visibleCards() {
    return this.scope.locator(card.visible);
  }
  get titles() {
    return this.scope.locator(card.title);
  }
  get plays() {
    return this.scope.locator(card.play);
  }
  /** Play buttons in the main reading region, excluding Next's hidden streamed copy. */
  get mainPlays() {
    return this.scope.locator(card.mainPlay);
  }
  get actionIconButtons() {
    return this.scope.locator(card.actionIconButton);
  }
  get downloadedBadges() {
    return this.scope.locator(card.downloadedBadge);
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
