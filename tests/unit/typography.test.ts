import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The type system uses exactly two weights of Be Vietnam Pro: regular (400) and bold (700).
// Every other weight is either a third font file on every route (each weight costs a Latin and a
// Vietnamese subset, about 35 KiB that share the startup link with the code listening needs) or a
// weight the browser substitutes or synthesizes. Bold carries names and actions (headings,
// titles, buttons, links, chips, navigation, labels, errors and status); regular carries running
// text and values, and the 13-14 px phone tab labels, which crowd each other in bold.
const weights = new Set(["400", "700"]);
const keywords = new Set(["inherit", "normal", "bold"]);

const read = (path: string) => readFileSync(path, "utf8");
const stylesheets = [
  ...readdirSync("src/styles")
    .filter((name) => name.endsWith(".css"))
    .map((name) => join("src/styles", name)),
  "public/offline/style.css",
];
const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

describe("two font weights", () => {
  it("loads only the regular and bold faces", () => {
    const loaded = [
      ...read("src/styles/index.ts").matchAll(/@fontsource\/be-vietnam-pro\/([a-z]+)-(\d+)\.css/g),
    ].map(([, subset, weight]) => `${subset}-${weight}`);
    expect(loaded.sort()).toEqual(
      ["latin-400", "latin-700", "vietnamese-400", "vietnamese-700"].sort(),
    );
  });

  it("stylesheets set only regular or bold", () => {
    const used = stylesheets.flatMap((path) =>
      [...read(path).matchAll(/font-weight\s*:\s*([^;}\s]+)/g)].map(([, value]) => ({
        path,
        value,
      })),
    );
    expect(used.length, "no font-weight found; the pattern may be stale").toBeGreaterThan(20);
    expect(
      used
        .filter(({ value }) => !weights.has(value) && !keywords.has(value))
        .map(({ path, value }) => `${path}: ${value}`),
    ).toEqual([]);
  });

  it("components set no other weight inline", () => {
    const stray = sources("src").flatMap((path) =>
      [...read(path).matchAll(/(?:fontWeight|font-weight)\s*[:=]\s*["'{]*\s*(\d{3})/g)]
        .filter(([, value]) => !weights.has(value))
        .map(([match]) => `${path}: ${match}`),
    );
    expect(stray).toEqual([]);
  });
});
