import { describe, expect, it } from "vitest";
import { gardenForPath, initialQuality, lowerQuality } from "../../src/lib/garden/config";
import { appearanceBootstrap } from "../../src/components/appearance";

describe("garden route and resource policy", () => {
  it("gives every application route a distinct garden across locales", () => {
    const routes = [
      "",
      "explore",
      "brainwave-entrainment",
      "library",
      "downloads",
      "mood",
      "settings",
      "admin",
      "reset-password",
      "privacy",
      "terms",
      "credits",
    ];
    const scenes = routes.map((route) => gardenForPath(`/vi/${route}`));
    expect(new Set(scenes).size).toBe(routes.length);
    expect(routes.map((route) => gardenForPath(`/en/${route}`))).toEqual(scenes);
    expect(gardenForPath("/en/missing-page")).toBe("cloister");
  });
  it("bounds mobile resolution and degrades monotonically to a still", () => {
    const initial = initialQuality(true);
    expect(initial.fps).toBeLessThanOrEqual(30);
    expect(initial.pixelRatio).toBeLessThanOrEqual(1);
    const middle = lowerQuality(initial)!;
    const lowest = lowerQuality(middle)!;
    expect(middle.pixelRatio).toBeLessThan(initial.pixelRatio);
    expect(lowest.pixelRatio).toBeLessThan(middle.pixelRatio);
    expect(lowerQuality(lowest)).toBeNull();
  });
});

describe("appearance before hydration", () => {
  const run = (stored: string | null, dark: boolean, denied = false) => {
    const element = { dataset: {} as Record<string, string> };
    const execute = new Function("document", "localStorage", "matchMedia", appearanceBootstrap);
    execute(
      { documentElement: element },
      {
        getItem: () => {
          if (denied) throw new Error("Denied");
          return stored;
        },
      },
      () => ({ matches: dark }),
    );
    return element.dataset;
  };
  it("honors night and still choices before the first themed render", () => {
    expect(run('{"appearance":"night","garden":"still"}', false)).toMatchObject({
      theme: "night",
      garden: "still",
    });
  });
  it("uses system appearance for unknown, corrupted or unavailable storage", () => {
    expect(run('{"appearance":"invalid"}', true).theme).toBe("night");
    expect(run("not json", true).theme).toBe("night");
    expect(run(null, false, true).theme).toBe("day");
  });
});
