import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  GRAPHICS,
  KIB,
  METRICS,
  MODULES,
  ceilingFor,
  codePointsOf,
  compareCeilings,
  covers,
  detected,
  fontFaces,
  gzipSize,
  moduleFindings,
  parseUnicodeRange,
  productionShaped,
  staleDetectors,
} from "../../scripts/check-budgets.mjs";
import { routes } from "@/lib/routes";
import { graphicsMarkers } from "@/lib/garden/budget-markers";

const chunk = (path: string, text: string) => ({ path, bytes: Buffer.from(text) });
const measurement = (startupJsGzip: number) => ({
  startupJsGzip,
  startupCssGzip: 10,
  fontBytes: 10,
  fontRequests: 6,
  mobilePosterBytes: 10,
});

describe("gzip accounting", () => {
  it("re-gzips at level 9 so the result does not depend on server compression", () => {
    const text = Buffer.from("const garden = 'lotus';\n".repeat(400));
    expect(gzipSize(text)).toBe(gzipSync(text, { level: 9 }).length);
    expect(gzipSize(text)).toBeLessThanOrEqual(gzipSync(text, { level: 1 }).length);
    expect(gzipSize(text)).toBe(gzipSize(Buffer.from(text)));
  });

  it("gives bytes 4 percent headroom rounded up to the next KiB and counts none", () => {
    expect(ceilingFor(244_547, "bytes")).toBe(249 * KIB);
    expect(ceilingFor(1000, "bytes")).toBe(2 * KIB);
    expect(ceilingFor(25 * KIB, "bytes")).toBe(26 * KIB);
    expect(ceilingFor(0, "bytes")).toBe(0);
    expect(ceilingFor(6, "count")).toBe(6);
  });
});

describe("font resolution", () => {
  it("parses unicode-range lists, single points and wildcards", () => {
    expect(parseUnicodeRange("U+0000-00FF, U+0131,u+1ea0-1ef9")).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x1ea0, 0x1ef9],
    ]);
    expect(parseUnicodeRange("U+4??")).toEqual([[0x400, 0x4ff]]);
    expect(() => parseUnicodeRange("U+00FF-0000")).toThrow(/Invalid/);
    expect(() => parseUnicodeRange("latin")).toThrow(/Invalid/);
  });

  it("reads minified faces without unicode-range as covering every code point", () => {
    const [face] = fontFaces(
      '@font-face{font-family:Be Vietnam Pro;font-style:normal;font-weight:400;src:url(../media/a.woff2)format("woff2"),url(../media/a.woff)format("woff")}',
    );
    expect(face).toEqual({
      family: "Be Vietnam Pro",
      weight: "400",
      style: "normal",
      ranges: [[0, 0x10ffff]],
      sources: [
        { url: "../media/a.woff2", format: "woff2" },
        { url: "../media/a.woff", format: "woff" },
      ],
    });
  });

  it("keeps quoted URLs, data URLs and unicode-range intact in formatted CSS", () => {
    const faces = fontFaces(`
      @font-face {
        font-family: 'Be Vietnam Pro';
        font-weight: 600;
        src: url("./files/vi.woff2") format('woff2');
        unicode-range: U+0102-0103, U+1EA0-1EF9;
      }
      .title { font-weight: 600; }
      @font-face {
        font-family: "Inline";
        src: url(data:font/woff2;base64,AAAA) format("woff2");
        unicode-range: U+0400-045F;
      }`);
    expect(faces).toHaveLength(2);
    expect(faces[0].sources).toEqual([{ url: "./files/vi.woff2", format: "woff2" }]);
    expect(faces[0].ranges).toEqual([
      [0x102, 0x103],
      [0x1ea0, 0x1ef9],
    ]);
    expect(faces[1].family).toBe("Inline");
    expect(faces[1].sources[0].url).toBe("data:font/woff2;base64,AAAA");
  });

  it("counts a face only when its range covers the message text", () => {
    const vietnamese = codePointsOf({ player: { play: "Phát nhạc" }, list: ["Thư viện"] });
    const english = codePointsOf({ player: { play: "Play" } });
    const vietnameseRange = parseUnicodeRange("U+0102-0103,U+01AF-01B0,U+1EA0-1EF9");
    const cyrillic = parseUnicodeRange("U+0400-045F");
    expect(covers(vietnameseRange, vietnamese)).toBe(true);
    expect(covers(vietnameseRange, english)).toBe(false);
    expect(covers(cyrillic, vietnamese)).toBe(false);
    expect(covers([[0, 0x10ffff]], english)).toBe(true);
  });
});

describe("startup module detectors", () => {
  const chunks = [
    chunk("static/chunks/a.js", 'x="DialogContentModal";y=c.createChannelMerger(2)'),
    chunk("static/chunks/b.js", "new Error('THREE.WebGLRenderer: context lost')"),
  ];

  it("reports a marker that matches no emitted chunk as stale", () => {
    const stale = staleDetectors(MODULES, chunks).map((detector) => detector.id);
    expect(stale).toEqual(["gsap", "zod", "supabase-js", "youtube-embed"]);
    expect(staleDetectors(MODULES.slice(0, 2), chunks)).toEqual([]);
  });

  it("finds modules only in the chunks it is given", () => {
    expect(detected(MODULES, chunks)).toEqual(["radix-dialog", "three", "binaural-engine"]);
    expect(detected(MODULES, [chunks[1]])).toEqual(["three"]);
    expect(detected(MODULES, [])).toEqual([]);
  });

  it("recognises a production-shaped bundle by its inlined Supabase project URL", () => {
    const sdk = chunk("static/chunks/sdk.js", '"See https://supabase.com/docs/guides/auth"');
    expect(productionShaped([sdk])).toBe(false);
    expect(productionShaped([sdk, chunk("c.js", 'u="https://placeholder.supabase.co"')])).toBe(
      true,
    );
  });

  it("forbids unlisted modules and fails stale or unknown ratchet allowances", () => {
    expect(
      moduleFindings(
        { home: ["supabase-js", "three"], admin: ["zod"] },
        { home: ["supabase-js", "youtube-embed"], admin: ["zod", "made-up"] },
        MODULES,
      ),
    ).toEqual([
      "home: three.js is forbidden in startup JS",
      "home: YouTube embed no longer ships in startup; remove it from ratchetModules",
      'admin: unknown module "made-up" in ratchetModules',
    ]);
    expect(moduleFindings({ home: ["zod"] }, { home: ["zod"] }, MODULES)).toEqual([]);
  });
});

describe("ceiling comparison", () => {
  it("passes at the ceiling and fails above it", () => {
    const ceilings = { home: measurement(100) };
    expect(compareCeilings({ home: measurement(100) }, ceilings)).toEqual([]);
    expect(compareCeilings({ home: measurement(101) }, ceilings)).toEqual([
      "home.startupJsGzip: 101 exceeds the ceiling 100",
    ]);
  });

  it("fails a measured metric without a ceiling and a budget for an unknown route", () => {
    const partial: Partial<ReturnType<typeof measurement>> = measurement(1);
    delete partial.fontRequests;
    expect(
      compareCeilings({ home: measurement(1) }, { home: partial, retired: measurement(1) }),
    ).toEqual([
      "home.fontRequests: no ceiling in budgets.json",
      "retired: budgeted but not a registered route",
    ]);
  });

  it("budgets every registered route and every metric", () => {
    const budgets = JSON.parse(readFileSync("budgets.json", "utf8"));
    expect(Object.keys(budgets.routes)).toEqual(routes.map((entry) => entry.key));
    for (const budget of Object.values<Record<string, unknown>>(budgets.routes))
      for (const metric of Object.keys(METRICS)) expect(budget[metric]).toBeTypeOf("number");
    expect(budgets.limits).toEqual({ graphicsJsGzip: 220 * KIB, mobilePosterBytes: 80 * KIB });
  });
});

describe("graphics chunk markers", () => {
  const sources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(directory, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [join(directory, entry.name).split("\\").join("/")]
          : [],
    );
  const files = sources("src").filter((file) => file !== "src/lib/garden/budget-markers.ts");

  it("counts every explicit garden marker toward the graphics total", () => {
    for (const { marker } of Object.values(graphicsMarkers))
      expect(GRAPHICS.map((detector) => detector.marker)).toContain(marker);
  });

  it("embeds each marker in its graphics module and nowhere else", () => {
    for (const { marker, module } of Object.values(graphicsMarkers)) {
      const holders = files.filter((file) => readFileSync(file, "utf8").includes(marker));
      expect(holders).toEqual([module]);
    }
  });
});
