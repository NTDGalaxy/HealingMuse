import { describe, expect, it } from "vitest";
import {
  artworkFamilies,
  artworkGeometry,
  artworkPalette,
  artworkPalettes,
  artworkSeed,
  artworkTones,
  seededRandom,
} from "../../src/lib/artwork";
import { trackArtwork, trackColors } from "../../src/lib/validation";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "a",
  "",
];

describe("generated recording artwork", () => {
  it("covers every artwork family and colour a recording can carry", () => {
    expect([...artworkFamilies]).toEqual([...trackArtwork]);
    expect([...artworkTones]).toEqual([...trackColors]);
    expect(Object.keys(artworkPalettes).sort()).toEqual([...trackColors].sort());
  });

  it("falls back to lavender for an unknown or missing colour", () => {
    expect(artworkPalette(undefined)).toBe(artworkPalettes.lavender);
    expect(artworkPalette("teal")).toBe(artworkPalettes.lavender);
    expect(artworkPalette("rose")).toBe(artworkPalettes.rose);
  });

  it("draws the same cover for the same recording on every render", () => {
    for (const family of artworkFamilies)
      for (const id of ids)
        expect(artworkGeometry(id, family)).toEqual(artworkGeometry(id, family));
    expect(artworkSeed(ids[0])).toBe(artworkSeed(ids[0]));
    const first = seededRandom(7);
    const second = seededRandom(7);
    expect(Array.from({ length: 8 }, first)).toEqual(Array.from({ length: 8 }, second));
  });

  it("gives different recordings and different families different covers", () => {
    const covers = artworkFamilies.flatMap((family) =>
      ids.map((id) => JSON.stringify(artworkGeometry(id, family))),
    );
    expect(new Set(covers).size).toBe(covers.length);
  });

  it("keeps every coordinate finite and both light fields on the cover", () => {
    for (const family of [...artworkFamilies, "unknown"])
      for (const id of ids) {
        const { fields, paths, dots } = artworkGeometry(id, family);
        for (const point of [...fields, ...dots])
          for (const value of [point.x, point.y, point.r])
            expect(Number.isFinite(value)).toBe(true);
        for (const field of fields) {
          expect(field.x).toBeGreaterThanOrEqual(0);
          expect(field.x).toBeLessThanOrEqual(100);
          expect(field.y).toBeGreaterThanOrEqual(0);
          expect(field.y).toBeLessThanOrEqual(100);
        }
        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) {
          expect(path).toMatch(/^M-?\d/);
          expect(path).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
  });

  it("draws random values from [0, 1) for any seed", () => {
    for (const seed of [0, 1, artworkSeed(""), 0xffffffff]) {
      const random = seededRandom(seed);
      for (let index = 0; index < 200; index++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});
