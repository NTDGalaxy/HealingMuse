// Generated recording artwork: every recording gets a deterministic cover drawn from its id, its
// artwork family and its colour, so the catalogue needs no image requests and no licensed photos.
// The same palette colours the app's wash while a recording plays.

/** The artwork families a recording can carry (mirrors trackArtwork in src/lib/validation.ts). */
export const artworkFamilies = ["forest", "rain", "sea", "piano", "river", "night"] as const;
/** The colours a recording can carry (mirrors trackColors in src/lib/validation.ts). */
export const artworkTones = ["sage", "sand", "blue", "lavender", "rose"] as const;
export type ArtworkFamily = (typeof artworkFamilies)[number];
export type ArtworkTone = (typeof artworkTones)[number];

/** Light, middle and deep fields of a cover, plus the glow its wash and 3D scene take on. */
export type ArtworkPalette = Readonly<{ light: string; mid: string; deep: string; glow: string }>;

// Lavender, plum and jade lead; blue and rose are the two secondary hues; sand is a dusk mauve
// between lavender and rose.
export const artworkPalettes: Readonly<Record<ArtworkTone, ArtworkPalette>> = {
  lavender: { light: "#dccbff", mid: "#8d6bdc", deep: "#2a1744", glow: "#c9b6f0" },
  sage: { light: "#b8f4e1", mid: "#2bb08e", deep: "#0e2c27", glow: "#3fe0b5" },
  blue: { light: "#c6d6ff", mid: "#5a79de", deep: "#151b3e", glow: "#8fb0ff" },
  rose: { light: "#ffd2e3", mid: "#d6649a", deep: "#3a1231", glow: "#ff9cc4" },
  sand: { light: "#f2d8ec", mid: "#ae729c", deep: "#2b1530", glow: "#e6a8d1" },
};

/** The palette for a stored colour, falling back to lavender for anything unknown. */
export function artworkPalette(tone: string | undefined): ArtworkPalette {
  const known = (artworkTones as readonly string[]).includes(tone ?? "");
  return artworkPalettes[known ? (tone as ArtworkTone) : "lavender"];
}

/** FNV-1a: a stable 32-bit seed from a recording id. */
export function artworkSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A small deterministic generator (mulberry32) so a cover never changes between renders. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** One light field or point of a cover, in a 0-100 coordinate space. */
export type ArtworkField = Readonly<{ x: number; y: number; r: number }>;
/** A cover's geometry: two light fields, the family's line work as path data, and points. */
export type ArtworkGeometry = Readonly<{
  fields: readonly [ArtworkField, ArtworkField];
  paths: readonly string[];
  dots: readonly ArtworkField[];
}>;

/** An ellipse as path data, so every family draws with one element type. */
function ellipse(cx: number, cy: number, rx: number, ry: number, tilt = 0) {
  return `M${round(cx - rx)} ${cy}a${rx} ${ry} ${tilt} 1 0 ${round(rx * 2)} 0a${rx} ${ry} ${tilt} 1 0 ${round(-rx * 2)} 0`;
}

/** The geometry of a cover, a pure function of the recording id and its family. */
export function artworkGeometry(id: string, family: string): ArtworkGeometry {
  const random = seededRandom(artworkSeed(`${family}:${id}`));
  const at = (min: number, max: number) => round(min + random() * (max - min));
  const fields: [ArtworkField, ArtworkField] = [
    { x: at(18, 48), y: at(18, 46), r: at(48, 64) },
    { x: at(56, 86), y: at(58, 86), r: at(34, 50) },
  ];
  const paths: string[] = [];
  const dots: ArtworkField[] = [];
  switch (family) {
    case "rain": {
      // Falling strokes and the rings they leave on still water.
      for (let index = 0; index < 18; index++) {
        const x = at(6, 94),
          y = at(4, 64);
        paths.push(`M${x} ${y}V${round(y + at(5, 12))}`);
      }
      const cx = at(30, 70),
        cy = at(76, 86);
      for (const r of [5, 10, 16]) paths.push(ellipse(cx, cy, r, round(r * 0.32)));
      break;
    }
    case "sea": {
      // Stacked swells, each a little calmer than the one above.
      const phase = at(0, 30);
      for (let row = 0; row < 6; row++) {
        const y = 40 + row * 9,
          swell = round(5 - row * 0.6);
        paths.push(
          `M-10 ${y}C${round(10 + phase)} ${round(y - swell)} ${round(30 + phase)} ${round(y + swell)} ${round(55 + phase)} ${y}S${round(95 + phase)} ${round(y - swell)} 130 ${y}`,
        );
      }
      break;
    }
    case "piano": {
      // A still row of levels, like keys or a quiet meter.
      const count = 14,
        base = at(78, 86);
      for (let index = 0; index < count; index++) {
        const x = round(8 + index * (84 / (count - 1)));
        paths.push(`M${x} ${base}V${round(base - at(8, 46))}`);
      }
      break;
    }
    case "river": {
      // Long bands flowing corner to corner.
      const bend = at(-14, 14);
      for (let band = 0; band < 6; band++) {
        const offset = band * 11 - 20;
        paths.push(
          `M-10 ${round(70 + offset)}C25 ${round(60 + offset + bend)} 55 ${round(40 + offset - bend)} 110 ${round(28 + offset)}`,
        );
      }
      break;
    }
    case "night": {
      // Orbits and the points travelling on them.
      const cx = at(38, 62),
        cy = at(38, 62),
        tilt = at(-20, 20);
      for (const [rx, ry] of [
        [18, 7],
        [30, 12],
        [44, 18],
      ] as const) {
        paths.push(ellipse(cx, cy, rx, ry, tilt));
        const angle = random() * Math.PI * 2;
        dots.push({
          x: round(cx + Math.cos(angle) * rx),
          y: round(cy + Math.sin(angle) * ry),
          r: round(1.2 + random() * 1.3),
        });
      }
      for (let index = 0; index < 10; index++)
        dots.push({ x: at(4, 96), y: at(4, 96), r: round(0.4 + random() * 0.6) });
      break;
    }
    default: {
      // forest: rings around an off-centre point, like growth rings or a held note.
      const cx = at(24, 76),
        cy = at(24, 76);
      for (let ring = 1; ring <= 7; ring++) {
        const r = round(ring * 7.5 + random() * 2);
        paths.push(ellipse(cx, cy, r, r));
      }
    }
  }
  return { fields, paths, dots };
}
