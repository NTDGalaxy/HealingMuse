import type { Locator, Page } from "@playwright/test";
import { explore } from "../contracts";
import {
  pattern,
  t,
  wholePattern,
  type Locale,
  type MessageKey,
  type MessageValues,
} from "../i18n";
import { Recordings } from "./track-card";

type Facet = "genre" | "goal" | "instrument" | "tradition";

/** The label of each facet select (the goal facet asks how the listener would like to spend time). */
const facetLabels: Record<Facet, MessageKey> = {
  goal: "home.today",
  genre: "catalog.genre",
  instrument: "catalog.instrument",
  tradition: "catalog.tradition",
};

/**
 * Catalogue search, filters and paging. The Explore route and the binaural mixer render the
 * same controls; `scope` is the page or the section that owns them.
 */
export class Explore {
  readonly recordings: Recordings;

  constructor(
    readonly page: Page,
    readonly locale: Locale = "en",
    readonly scope: Page | Locator = page,
  ) {
    this.recordings = new Recordings(scope, locale);
  }

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  /** The reading region of the Explore route, never Next's hidden streamed copy. */
  private get main() {
    return this.page.getByRole("main");
  }
  /** The section that owns the controls: the given section, or the route's reading region. */
  private get region() {
    return this.scope === this.page ? this.main : this.scope;
  }

  /** The search field, matched by a name that contains the label unless `exact` is set. */
  search(options: { exact?: boolean } = {}) {
    return this.scope.getByRole("searchbox", { name: this.t("catalog.search"), ...options });
  }
  async searchFor(query: string, options: { exact?: boolean } = {}) {
    await this.search(options).fill(query);
    await this.search(options).press("Enter");
  }
  get anySearchbox() {
    return this.scope.getByRole("searchbox");
  }
  /** Filter disclosure summary and facets in the main reading region of the Explore route. */
  get mainFilterSummary() {
    return this.main.getByText(this.t("catalog.filters"), { exact: true });
  }
  get mainFacets() {
    return this.main.locator(explore.facets);
  }
  /** The filter disclosure summary of a catalogue section. */
  get filterSummary() {
    return this.scope.getByText(this.t("catalog.filters"), { exact: true });
  }
  /** A facet select, by the label it shows. */
  facet(name: Facet, within: Page | Locator = this.scope) {
    return within.getByRole("combobox", { name: pattern(this.locale, facetLabels[name]) });
  }
  /** The live line that reports how many recordings match, or that they are loading. */
  get resultsNote() {
    return this.region.getByRole("status");
  }
  /** A results note in the reading region that still reports loading. */
  get loadingResultsNote() {
    return this.main
      .getByRole("status")
      .filter({ hasText: wholePattern(this.locale, "common.loading") });
  }
  get nextPage() {
    return this.scope.getByRole("button", { name: this.t("catalog.next"), exact: true });
  }
  get previousPage() {
    return this.scope.getByRole("button", { name: this.t("common.back"), exact: true });
  }
  /** The category toggles, a group named after the catalogue. */
  get categories() {
    return this.scope.getByRole("group", { name: this.t("catalog.title"), exact: true });
  }
  category(key: "instrumental" | "nature") {
    return this.categories.getByRole("button", { name: this.t(`catalog.${key}`), exact: true });
  }
  get allCategories() {
    return this.categories.getByRole("button", { name: this.t("common.all"), exact: true });
  }
  get clearFilters() {
    return this.categories.getByRole("button", { name: this.t("catalog.clear"), exact: true });
  }
  get noResults() {
    return this.scope.getByRole("heading", { name: this.t("catalog.noResults"), exact: true });
  }
  get alert() {
    return this.scope.getByRole("alert");
  }
  get retry() {
    return this.scope.getByRole("button", { name: this.t("common.retry"), exact: true });
  }
  results(count: number) {
    return this.t("catalog.results", { count });
  }
  /** Links in the reading region that open one catalogue category. */
  mainCategoryLink(category: string) {
    return this.main.locator(explore.categoryLink(category));
  }
}
