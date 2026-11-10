// The single route table for HealingMuse.
// Keep this module free of imports and non-erasable syntax: ops scripts load it with Node's
// native TypeScript support, and tests/unit/native-imports.test.ts guards that contract.

export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "vi";

/** Where a destination appears: primary (sidebar + phone tab bar), more (sidebar + More),
 * admin (content administrators only), legal (footer + More), hidden (reachable by link only). */
export type RoutePlacement = "primary" | "more" | "admin" | "legal" | "hidden";

/** Decorative scene shown behind each route. Every id has exactly one route. */
export type SceneId =
  | "lotus"
  | "fern"
  | "moonflower"
  | "wisteria"
  | "seed"
  | "lily"
  | "bonsai"
  | "propagation"
  | "orchid"
  | "cloister"
  | "cypress"
  | "sculpture";

export type RouteDefinition = {
  readonly key: string;
  /** Path segment after the locale; "" is Home. */
  readonly segment: string;
  readonly placement: RoutePlacement;
  readonly scene: SceneId;
};

export const routes = [
  { key: "home", segment: "", placement: "primary", scene: "lotus" },
  { key: "explore", segment: "explore", placement: "primary", scene: "fern" },
  { key: "binaural", segment: "brainwave-entrainment", placement: "primary", scene: "moonflower" },
  { key: "library", segment: "library", placement: "primary", scene: "wisteria" },
  { key: "downloads", segment: "downloads", placement: "more", scene: "seed" },
  { key: "mood", segment: "mood", placement: "more", scene: "lily" },
  { key: "settings", segment: "settings", placement: "more", scene: "bonsai" },
  { key: "admin", segment: "admin", placement: "admin", scene: "propagation" },
  { key: "resetPassword", segment: "reset-password", placement: "hidden", scene: "orchid" },
  { key: "privacy", segment: "privacy", placement: "legal", scene: "cloister" },
  { key: "terms", segment: "terms", placement: "legal", scene: "cypress" },
  { key: "credits", segment: "credits", placement: "legal", scene: "sculpture" },
] as const satisfies readonly RouteDefinition[];

export type Route = (typeof routes)[number];
export type RouteKey = Route["key"];

/** Scene shown for paths that match no route (for example a 404). */
export const fallbackScene: SceneId = "cloister";

const byKey = new Map<string, Route>(routes.map((entry) => [entry.key, entry]));
const bySegment = new Map<string, Route>(routes.map((entry) => [entry.segment, entry]));

export function route(key: RouteKey): Route {
  return byKey.get(key)!;
}

/** Localized href for a route, for example routeHref("vi", "explore") === "/vi/explore". */
export function routeHref(locale: Locale, key: RouteKey): string {
  const { segment } = route(key);
  return segment ? `/${locale}/${segment}` : `/${locale}`;
}

/** The route whose segment is the second path part, ignoring the locale and deeper parts. */
export function routeForPath(pathname: string): Route | undefined {
  return bySegment.get(pathname.split("/")[2] ?? "");
}

/** True when the pathname is exactly this route in the given locale. */
export function isRouteActive(pathname: string, locale: Locale, key: RouteKey): boolean {
  return pathname === routeHref(locale, key);
}

/** True when the pathname ends with this route in any locale (query and hash excluded). */
export function isRoutePath(pathname: string, key: RouteKey): boolean {
  const { segment } = route(key);
  return locales.some((locale) =>
    pathname.endsWith(segment ? `/${locale}/${segment}` : `/${locale}`),
  );
}

/** The same path in another locale. */
export function localizedPath(pathname: string, locale: Locale): string {
  return pathname.replace(new RegExp(`^/(${locales.join("|")})`), `/${locale}`);
}

export function routesIn(...placements: RoutePlacement[]): Route[] {
  return routes.filter((entry) => placements.includes(entry.placement));
}
