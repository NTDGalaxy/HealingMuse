import { describe, expect, it } from "vitest";
import { motionPolicy } from "../../src/lib/motion-policy";
import { defaultPreferences } from "../../src/lib/preferences-store";

const policy = (patch: Partial<typeof defaultPreferences>) =>
  motionPolicy({ ...defaultPreferences, ...patch });

describe("decorative motion policy", () => {
  it("allows the scene, reveals and parallax when nothing asks for less", () => {
    expect(policy({})).toEqual({ scene: true, reveals: true, parallax: true });
  });

  it("shows the poster and stops every GSAP effect for Calm and reduced motion", () => {
    for (const patch of [{ calm: true }, { reducedMotion: true }])
      expect(policy(patch)).toEqual({ scene: false, reveals: false, parallax: false });
  });

  it("keeps reveals but stills the scene and the parallax for the Still garden", () => {
    expect(policy({ garden: "still" })).toEqual({ scene: false, reveals: true, parallax: false });
  });

  it("saves data by showing the poster while keeping the GSAP layer", () => {
    expect(policy({ saveData: true })).toEqual({ scene: false, reveals: true, parallax: true });
  });

  it("ignores appearance and theme", () => {
    expect(policy({ appearance: "night", theme: "night" })).toBe(policy({}));
  });

  it("returns the same frozen value for the same outcome", () => {
    expect(policy({ calm: true })).toBe(policy({ reducedMotion: true, garden: "still" }));
    expect(Object.isFrozen(policy({}))).toBe(true);
  });
});
