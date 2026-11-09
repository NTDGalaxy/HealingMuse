import type { Locator, Page } from "@playwright/test";
import { explore } from "../contracts";
import { t, wholePattern, type Locale, type MessageKey, type MessageValues } from "../i18n";
import { Recordings } from "./track-card";

type Facet = "genre" | "goal" | "instrument" | "tradition";

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
    private readonly facetId: (facet: Facet) => string = explore.facet,
  ) {
    this.recordings = new Recordings(scope, locale);
  }

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
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
  get filterChips() {
    return this.scope.locator(explore.filterChip);
  }
  /** Filter disclosure summary and facets in the main reading region of the Explore route. */
  get mainFilterSummary() {
    return this.page.locator(explore.mainFilterSummary);
  }
  get mainFacets() {
    return this.page.locator(explore.mainFacets);
  }
  /** The filter disclosure summary directly inside a catalogue section. */
  get filterSummary() {
    return this.scope.locator(explore.filterSummaryChild);
  }
  facet(name: Facet, within: Page | Locator = this.scope) {
    return within.locator(this.facetId(name));
  }
  get resultsNote() {
    return this.scope.locator(explore.resultsNote);
  }
  /** A visible results note in the reading region that still reports loading. */
  get loadingResultsNote() {
    return this.page.locator(explore.mainResultsNote, {
      hasText: wholePattern(this.locale, "common.loading"),
    });
  }
  get pager() {
    return this.scope.locator(explore.pager);
  }
  get nextPage() {
    return this.scope.getByRole("button", { name: this.t("catalog.next"), exact: true });
  }
  get previousPage() {
    return this.scope.getByRole("button", { name: this.t("common.back"), exact: true });
  }
  category(key: "instrumental" | "nature") {
    return this.scope.getByRole("button", { name: this.t(`catalog.${key}`), exact: true });
  }
  get allCategories() {
    return this.scope.getByRole("button", { name: this.t("common.all"), exact: true });
  }
  get clearFilters() {
    return this.scope
      .locator(explore.filterRow)
      .getByRole("button", { name: this.t("catalog.clear"), exact: true });
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
  mainCategoryLink(category: string) {
    return this.page.locator(explore.mainCategoryLink(category));
  }
}
