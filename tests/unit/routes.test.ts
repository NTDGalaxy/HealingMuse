import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isRouteActive,
  isRoutePath,
  localizedPath,
  locales,
  routeForPath,
  routeHref,
  routes,
  routesIn,
} from "../../src/lib/routes";

const appDir = "src/app/[locale]";

describe("route registry", () => {
  it("has unique keys, segments and scenes", () => {
    for (const field of ["key", "segment", "scene"] as const) {
      const values = routes.map((entry) => entry[field]);
      expect(new Set(values).size, field).toBe(routes.length);
    }
  });

  it("matches the pages that exist, in both directions", () => {
    const pages = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`${appDir}/${entry.name}/page.tsx`))
      .map((entry) => entry.name);
    const segments = routes.map((entry) => entry.segment).filter(Boolean);
    expect([...segments].sort()).toEqual([...pages].sort());
    expect(existsSync(`${appDir}/page.tsx`)).toBe(true);
  });

  it("keeps four primary destinations in their navigation order", () => {
    expect(routesIn("primary").map((entry) => entry.key)).toEqual([
      "home",
      "explore",
      "binaural",
      "library",
    ]);
    expect(routesIn("more").map((entry) => entry.key)).toEqual(["downloads", "mood", "settings"]);
    expect(routesIn("legal").map((entry) => entry.key)).toEqual(["privacy", "terms", "credits"]);
  });

  it("builds localized hrefs and active state", () => {
    expect(routeHref("vi", "home")).toBe("/vi");
    expect(routeHref("en", "binaural")).toBe("/en/brainwave-entrainment");
    expect(isRouteActive("/vi/explore", "vi", "explore")).toBe(true);
    expect(isRouteActive("/en/explore", "vi", "explore")).toBe(false);
    expect(isRouteActive("/vi", "vi", "home")).toBe(true);
  });

  it("reproduces the previous path rules exactly", () => {
    const binaural = /\/(?:en|vi)\/brainwave-entrainment$/;
    const samples = [
      "/vi",
      "/en",
      "/vi/brainwave-entrainment",
      "/en/brainwave-entrainment",
      "/vi/brainwave-entrainment/extra",
      "/fr/brainwave-entrainment",
      "/vi/explore",
      "/en/settings",
      "/en/missing-page",
      "/vi/constructor",
    ];
    for (const path of samples) {
      expect(isRoutePath(path, "binaural"), path).toBe(binaural.test(path));
      for (const locale of locales)
        expect(localizedPath(path, locale), path).toBe(path.replace(/^\/(vi|en)/, `/${locale}`));
    }
    expect(routeForPath("/vi/explore?q=piano".split("?")[0])?.key).toBe("explore");
    expect(routeForPath("/vi/constructor")).toBeUndefined();
    expect(routeForPath("/en")?.key).toBe("home");
  });
});
