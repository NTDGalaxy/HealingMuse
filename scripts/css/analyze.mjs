// @ts-check
// Cascade analysis for the global stylesheets, in the order src/styles/index.ts imports them.
//
//   node scripts/css/analyze.mjs          report duplicates, shadowed declarations, unreferenced
//                                         classes, !important and token sources
//   node scripts/css/analyze.mjs --fix    remove shadowed declarations (and rules or at-rules left
//                                         empty), keeping browser-floor fallbacks
//
// A declaration is shadowed when a later declaration of the same property, in the same cascade
// layer, for every selector of its rule (same selector text, so same specificity) under a
// condition that always holds when its own does, wins in every state: later in the same layer,
// and not a normal declaration overriding an !important one. Removing it cannot change the
// cascade in any browser that understands the later value. When the later value uses syntax
// above Next.js 16's browser floor (Chrome/Edge/Firefox 111, Safari 16.4), an older browser
// drops it at parse time and the earlier declaration is its fallback, so it is kept.
// Shadowed !important declarations are reported but never removed: important declarations reverse
// layer order, and the layer refactor keeps every one of them until the cascade is restructured.
import postcss from "postcss";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const entry = join(root, "src/styles/index.ts");
const fix = process.argv.includes("--fix");

/** Local stylesheets in cascade order, read from the single style entry module. */
const files = [...readFileSync(entry, "utf8").matchAll(/^import\s+"(\.{1,2}\/[^"]+\.css)";/gm)].map(
  (match) => resolve(dirname(entry), match[1]),
);
if (!files.length) throw new Error(`No local stylesheet imports found in ${entry}`);

/**
 * @typedef {{
 *   decl: import("postcss").Declaration,
 *   rule: import("postcss").Rule,
 *   file: string,
 *   position: number,
 *   property: string,
 *   layer: string,
 *   condition: string[],
 *   selectors: string[],
 * }} Entry
 */

const normalize = (/** @type {string} */ text) => text.replace(/\s+/g, " ").trim();
/** @type {Map<string, import("postcss").Root>} */
const sheets = new Map();
/** @type {Entry[]} */
const entries = [];
/** Anonymous @layer blocks are distinct layers, so each gets its own name. */
/** @type {Map<import("postcss").AtRule, string>} */
const anonymousLayers = new Map();
let important = 0;
for (const file of files) {
  const sheet = postcss.parse(readFileSync(file, "utf8"), { from: file });
  sheets.set(file, sheet);
  sheet.walkDecls((decl) => {
    if (decl.important) important += 1;
    const rule = decl.parent;
    if (!rule || rule.type !== "rule") return;
    /** @type {string[]} */
    const layers = [];
    /** @type {string[]} */
    const condition = [];
    let analysable = true;
    for (let node = rule.parent; node && node.type !== "root"; node = node.parent) {
      if (node.type === "atrule") {
        const atRule = /** @type {import("postcss").AtRule} */ (node);
        if (atRule.name === "layer") {
          let name = atRule.params || anonymousLayers.get(atRule);
          if (!name) {
            name = `anonymous-${anonymousLayers.size + 1}`;
            anonymousLayers.set(atRule, name);
          }
          layers.unshift(name);
        } else if (["media", "supports", "container"].includes(atRule.name))
          condition.unshift(`@${atRule.name} ${normalize(atRule.params)}`);
        else analysable = false;
      } else analysable = false;
    }
    if (!analysable) return;
    entries.push({
      decl,
      rule: /** @type {import("postcss").Rule} */ (rule),
      file,
      position: entries.length,
      property: decl.prop.startsWith("--") ? decl.prop : decl.prop.toLowerCase(),
      layer: layers.join("."),
      condition,
      selectors: /** @type {import("postcss").Rule} */ (rule).selectors.map(normalize),
    });
  });
}

/**
 * Constraints of a simple media query chain, or null when it uses anything this analysis does
 * not model (types, `not`, `or`, lists, non-px lengths).
 * @param {string[]} condition
 */
function mediaConstraints(condition) {
  /** @type {Map<string, string>} */
  const discrete = new Map();
  /** @type {Record<string, number>} */
  const range = {};
  for (const part of condition) {
    if (!part.startsWith("@media ")) return null;
    const query = part.slice(7);
    if (/,|\bnot\b|\bor\b|\bonly\b/.test(query)) return null;
    for (const term of query.split(/\s+and\s+/)) {
      const match = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(term.trim());
      if (!match) return null;
      const [, name, value] = match;
      const bound = /^(min|max)-(width|height)$/.exec(name);
      if (bound) {
        const pixels = /^(\d+(?:\.\d+)?)px$/.exec(value);
        if (!pixels) return null;
        const number = Number(pixels[1]);
        range[name] =
          bound[1] === "max"
            ? Math.min(range[name] ?? Infinity, number)
            : Math.max(range[name] ?? -Infinity, number);
      } else discrete.set(name, value);
    }
  }
  return { discrete, range };
}

/** True when `outer` holds in every state in which `inner` holds. */
function implies(/** @type {string[]} */ inner, /** @type {string[]} */ outer) {
  if (!outer.length) return true;
  if (inner.join(" && ") === outer.join(" && ")) return true;
  const a = mediaConstraints(inner);
  const b = mediaConstraints(outer);
  if (!a || !b) return false;
  for (const [name, value] of b.discrete) if (a.discrete.get(name) !== value) return false;
  for (const [name, limit] of Object.entries(b.range)) {
    const own = a.range[name];
    if (own === undefined) return false;
    if (name.startsWith("max") ? own > limit : own < limit) return false;
  }
  return true;
}

// Value syntax every floor browser parses. Anything else may be dropped by an older browser, which
// then falls back to the earlier declaration.
const basicFunctions = new Set(
  (
    "var calc min max clamp rgb rgba hsl hsla url linear-gradient radial-gradient " +
    "repeating-linear-gradient repeating-radial-gradient conic-gradient translate translatex " +
    "translatey translate3d scale scalex scaley rotate skew skewx skewy matrix cubic-bezier steps " +
    "blur brightness saturate contrast grayscale drop-shadow opacity invert sepia hue-rotate " +
    "repeat minmax fit-content inset circle ellipse polygon attr counter counters env format local"
  ).split(" "),
);
const basicUnits = new Set(
  "px em rem % vh vw vmin vmax dvh svh lvh dvw svw lvw ch ex s ms deg rad turn fr dppx x".split(
    " ",
  ),
);
/** @param {string} value */
function basic(value) {
  const plain = value.replace(/"[^"]*"|'[^']*'/g, "").replace(/#[0-9a-f]{3,8}\b/gi, "");
  if (/(^|[\s(,])-(webkit|moz|ms|o)-|\bstretch\b/i.test(plain)) return false;
  for (const match of plain.matchAll(/([a-z-]+)\(/gi))
    if (!basicFunctions.has(match[1].toLowerCase())) return false;
  for (const match of plain.matchAll(/(?:^|[^a-z0-9_-])-?(?:\d*\.)?\d+([a-z%]+)/gi))
    if (!basicUnits.has(match[1].toLowerCase())) return false;
  return true;
}

/** @type {Map<string, Entry[]>} */
const byProperty = new Map();
for (const item of entries) {
  const key = `${item.layer}\u0000${item.property}`;
  byProperty.set(key, [...(byProperty.get(key) ?? []), item]);
}
/** @type {Entry[]} */
const removable = [];
/** @type {{ item: Entry, by: Entry }[]} */
const fallbacks = [];
/** @type {Entry[]} */
const importantKept = [];
for (const item of entries) {
  const later = (byProperty.get(`${item.layer}\u0000${item.property}`) ?? []).filter(
    (other) =>
      other.position > item.position &&
      !(item.decl.important && !other.decl.important) &&
      implies(item.condition, other.condition),
  );
  /** @type {Entry | undefined} */
  let modern;
  const shadowed = item.selectors.every((selector) => {
    const winners = later.filter((other) => other.selectors.includes(selector));
    if (winners.some((other) => other.decl.value === item.decl.value || basic(other.decl.value)))
      return true;
    modern ??= winners[0];
    return false;
  });
  if (shadowed && item.decl.important) importantKept.push(item);
  else if (shadowed) removable.push(item);
  else if (modern && item.selectors.every((s) => later.some((o) => o.selectors.includes(s))))
    fallbacks.push({ item, by: modern });
}

const where = (/** @type {Entry} */ item) =>
  `${relative(root, item.file)}:${item.decl.source?.start?.line}`;
const describe = (/** @type {Entry} */ item) =>
  `${where(item)} ${[...item.condition, item.selectors.join(", ")].join(" ")} { ${item.decl.prop}: ${item.decl.value}${item.decl.important ? " !important" : ""} }`;

// Selector and condition pairs that more than one rule defines.
/** @type {Map<string, Set<import("postcss").Rule>>} */
const pairs = new Map();
for (const item of entries)
  for (const selector of item.selectors) {
    const key = [item.layer, ...item.condition, selector].join(" | ");
    pairs.set(key, (pairs.get(key) ?? new Set()).add(item.rule));
  }
const duplicated = [...pairs].filter(([, rules]) => rules.size > 1);

// Classes no source, test, script or offline-shell file mentions.
const searchRoots = ["src", "tests", "scripts", "public/offline"].map((path) => join(root, path));
const corpus = (function read(/** @type {string[]} */ paths) {
  let text = "";
  for (const path of paths) {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) text += read(readdirSync(path).map((name) => join(path, name)));
    else if (/\.(tsx?|mjs|js|html|json)$/.test(path) && !files.includes(path))
      text += `\n${readFileSync(path, "utf8")}`;
  }
  return text;
})(searchRoots);
const classes = new Set();
for (const item of entries)
  for (const selector of item.selectors)
    for (const match of selector.replace(/\[[^\]]*\]/g, "").matchAll(/\.([a-zA-Z_][\w-]*)/g))
      classes.add(match[1]);
const escape = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unreferenced = [...classes]
  .filter((name) => {
    if (new RegExp(`(^|[^\\w-])${escape(name)}($|[^\\w-])`).test(corpus)) return false;
    // Dynamic names such as `poster-${variant}` or `art-${color}`.
    const parts = name.split("-");
    for (let size = 1; size < parts.length; size++)
      if (corpus.includes(`${parts.slice(0, size).join("-")}-\${`)) return false;
    return true;
  })
  .sort();

// Token contract: custom properties on the root element live only in tokens.css.
const tokenFile = join(root, "src/styles/tokens.css");
const rootSelector = /^(:root|html)(\[[^\]]+\])*$/;
const strayTokens = entries.filter(
  (item) =>
    item.file !== tokenFile &&
    item.property.startsWith("--") &&
    item.selectors.some((selector) => rootSelector.test(selector)),
);

const ruleCount = entries.reduce((set, item) => set.add(item.rule), new Set()).size;
console.log(`Stylesheets: ${files.map((file) => relative(root, file)).join(", ")}`);
console.log(`Style rules: ${ruleCount}; declarations: ${entries.length}; !important: ${important}`);
console.log(`Selector and condition pairs defined more than once: ${duplicated.length}`);
const shadowedCount = removable.length + fallbacks.length + importantKept.length;
console.log(
  `Shadowed declarations: ${shadowedCount} (${((shadowedCount / entries.length) * 100).toFixed(1)}%); ` +
    `removable ${removable.length}; kept as browser-floor fallbacks ${fallbacks.length}; ` +
    `kept because !important ${importantKept.length}`,
);
for (const item of importantKept) console.log(`  !important kept: ${describe(item)}`);
for (const { item, by } of fallbacks)
  console.log(`  fallback kept: ${describe(item)}\n            for: ${describe(by)}`);
console.log(`Unreferenced classes: ${unreferenced.length ? unreferenced.join(", ") : "none"}`);
console.log(`Root custom properties outside tokens.css: ${strayTokens.length}`);
for (const item of strayTokens) console.log(`  ${describe(item)}`);

if (fix) {
  const touched = new Set();
  for (const item of removable) {
    console.log(`removed: ${describe(item)}`);
    item.decl.remove();
    touched.add(item.file);
  }
  for (const file of touched) {
    const sheet = /** @type {import("postcss").Root} */ (sheets.get(file));
    // Drop rules and grouping at-rules left without content, innermost first.
    const grouping = ["media", "supports", "container", "layer"];
    /** @param {import("postcss").ChildNode} node */
    const empty = (node) =>
      (node.type === "rule" || (node.type === "atrule" && grouping.includes(node.name))) &&
      node.nodes !== undefined &&
      node.nodes.every((child) => child.type === "comment");
    let changed = true;
    while (changed) {
      changed = false;
      sheet.walk((node) => {
        if (empty(node)) {
          node.remove();
          changed = true;
        }
      });
    }
    writeFileSync(file, sheet.toString());
  }
  console.log(`Removed ${removable.length} shadowed declarations from ${touched.size} file(s).`);
} else if (removable.length) {
  console.log("Removable (run with --fix):");
  for (const item of removable) console.log(`  ${describe(item)}`);
}
