import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gardens, initialQuality, lowerQuality, type GardenId } from "../../src/lib/garden/config";
import { composeScene } from "../../src/lib/garden/scene";
import { gardenForPath } from "../../src/lib/garden/route";
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

/** What a scene draws: every part's kind, vertex count, placement and instance placements. */
function structure(id: GardenId) {
  const scene = composeScene(id, "night");
  scene.animate(0);
  scene.group.updateMatrixWorld(true);
  const parts: string[] = [];
  const round = (values: ArrayLike<number>) =>
    Array.from(values, (value) => Math.round(value * 100) / 100).join(",");
  scene.group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    let part = `${object.type}:${geometry.getAttribute("position").count}:${round(object.matrixWorld.elements)}`;
    if (object instanceof THREE.InstancedMesh) part += `:${round(object.instanceMatrix.array)}`;
    parts.push(part);
  });
  const visible = (tier: number) => {
    scene.detail(tier);
    let count = 0;
    scene.group.traverse((object) => {
      if (object !== scene.group && object.visible) count++;
    });
    return count;
  };
  const tiers = [visible(2), visible(1), visible(0)];
  scene.dispose();
  return { drawing: parts.join("|"), tiers };
}

describe("light scenes", () => {
  const ids = Object.keys(gardens) as GardenId[];

  it("draws a structurally different scene for every route, even where two share a form", () => {
    const drawings = ids.map((id) => structure(id).drawing);
    expect(new Set(drawings).size).toBe(ids.length);
    for (const drawing of drawings) expect(drawing.length).toBeGreaterThan(0);
  });

  it("uses every light form and a distinct seed for each scene", () => {
    expect(new Set(ids.map((id) => gardens[id].form)).size).toBe(7);
    expect(new Set(ids.map((id) => gardens[id].seed)).size).toBe(ids.length);
  });

  it("shows no more parts at a lower detail tier, and keeps something at the lowest", () => {
    for (const id of ids) {
      const [full, middle, lowest] = structure(id).tiers;
      expect(middle).toBeLessThanOrEqual(full);
      expect(lowest).toBeLessThanOrEqual(middle);
      expect(lowest).toBeGreaterThan(0);
    }
  });
});
