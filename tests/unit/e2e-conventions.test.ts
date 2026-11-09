import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conventions that keep the end-to-end suite independent of styling, so a redesign that renames
// classes or restructures markup edits tests/e2e/support/ and never a spec.
//
// Specs (tests/e2e/**/*.spec.ts) must not
// - pass a raw CSS selector, a string literal starting with ".", "#" or "[", to locator, $, $$,
//   $eval, $$eval, waitForSelector or frameLocator, or as the scope of expectAccessible or axe;
// - call waitForTimeout: wait for the state the test needs instead;
// - name an element by literal interface copy: a string, regular expression or template literal
//   with text as the `name` of getByRole or the text of getByText, getByLabel, getByPlaceholder,
//   getByAltText or getByTitle. Copy comes from the message files through support/i18n.ts.
// Support modules other than contracts.ts (page objects and helpers) follow the first rule too, so
// every selector lives in contracts.ts.
//
// No string in tests/e2e/support/contracts.ts may contain a class token (".name") or an id
// selector ("#name"), and no selector there may name an element type, except the entries of
// `elementSelectors` below, each with the reason it cannot move to a role, a label or a data-part.
// Strings that contain "/" outside attribute values are paths, URLs or globs and are skipped.

const elementSelectors: Record<string, string> = {
  main: "The main landmark for CSS contexts that take no role locator: axe scopes, in-page probes.",
  audio:
    "The persistent player's media element. Locating it by type keeps audioElement() strict, so a second media element anywhere in the document fails the test.",
  canvas:
    "The WebGL canvas the garden renderer creates inside the garden host at runtime, outside the markup React renders.",
};

const selectorMethods = new Set([
  "locator",
  "$",
  "$$",
  "$eval",
  "$$eval",
  "waitForSelector",
  "frameLocator",
]);
/** Helpers whose second argument is a CSS scope. */
const scopedHelpers = new Set(["expectAccessible", "axe"]);
const textMethods = new Set([
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
]);

/** HTML element names a type selector in contracts.ts could use. */
const htmlElements = new Set(
  (
    "a abbr article aside audio b body button canvas caption code dd details dialog div dl dt em " +
    "fieldset figure footer form h1 h2 h3 h4 h5 h6 header html i iframe img input label legend " +
    "li main nav ol option output p picture progress section select small source span strong " +
    "summary svg table tbody td textarea th thead time tr ul video"
  ).split(" "),
);

const repository = join(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(repository, path), "utf8");
function sources(directory: string, accept: (path: string) => boolean): string[] {
  return readdirSync(join(repository, directory), { recursive: true, encoding: "utf8" })
    .map((path) => join(directory, path).replaceAll("\\", "/"))
    .filter(accept)
    .sort();
}

function parse(path: string, text: string) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function visit(node: ts.Node, each: (node: ts.Node) => void) {
  each(node);
  node.forEachChild((child) => visit(child, each));
}
function where(source: ts.SourceFile, node: ts.Node) {
  return `${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

/** A string or template literal's text, with every substitution replaced by `placeholder`. */
function literalText(node: ts.Node | undefined, placeholder = "x"): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text + node.templateSpans.map((span) => placeholder + span.literal.text).join("")
    );
  return null;
}
/** Whether a name or text argument is interface copy written into the test. */
function isLiteralCopy(node: ts.Node | undefined): boolean {
  if (!node) return false;
  if (ts.isRegularExpressionLiteral(node)) return true;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  // A template only joins values (`${a}: ${b}`) unless its literal parts contain letters.
  return ts.isTemplateExpression(node) && /\p{L}/u.test(literalText(node, "") ?? "");
}
function calledName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isIdentifier(callee)) return callee.text;
  return null;
}
function isRawSelector(node: ts.Node | undefined): boolean {
  return /^\s*[.#[]/.test(literalText(node) ?? "");
}

/** Raw selectors and waitForTimeout calls in a spec or support module. */
function selectorFindings(path: string, text: string): string[] {
  const source = parse(path, text);
  const found: string[] = [];
  visit(source, (node) => {
    if (ts.isIdentifier(node) && node.text === "waitForTimeout")
      found.push(`${where(source, node)} waits for a timeout instead of a state`);
    if (!ts.isCallExpression(node)) return;
    const name = calledName(node);
    const [first, second] = node.arguments;
    if (name && selectorMethods.has(name) && isRawSelector(first))
      found.push(`${where(source, node)} passes a raw selector to ${name}`);
    if (name && scopedHelpers.has(name) && isRawSelector(second))
      found.push(`${where(source, node)} passes a raw selector scope to ${name}`);
  });
  return found;
}

/** Literal interface copy used to find elements in a spec. */
function copyFindings(path: string, text: string): string[] {
  const source = parse(path, text);
  const found: string[] = [];
  visit(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calledName(node);
    const [first, second] = node.arguments;
    if (name && textMethods.has(name) && isLiteralCopy(first))
      found.push(`${where(source, node)} finds an element by literal text with ${name}`);
    if (name === "getByRole" && second && ts.isObjectLiteralExpression(second))
      for (const property of second.properties)
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "name" &&
          isLiteralCopy(property.initializer)
        )
          found.push(`${where(source, node)} finds a ${literalText(first)} by a literal name`);
  });
  return found;
}

/** The element types a selector uses, or null when the text is not shaped like a selector. */
function elementTypes(selector: string): string[] | null {
  const compounds = selector
    .trim()
    .split(/\s*[\s,>+~]\s*/)
    .filter(Boolean);
  const compound = /^(?:\*|[a-z][a-z0-9]*)?(?:\[\]|::?[a-z-]+(?:\([^)]*\))?)*$/;
  if (!compounds.length || !compounds.every((part) => compound.test(part))) return null;
  return compounds
    .map((part) => /^[a-z][a-z0-9]*/.exec(part)?.[0] ?? "")
    .filter((type) => htmlElements.has(type));
}

/** Styling hooks and element structure named by the strings of contracts.ts. */
function contractFindings(path: string, text: string): string[] {
  const source = parse(path, text);
  const found: string[] = [];
  visit(source, (node) => {
    const parent = node.parent as ts.Node | undefined;
    if (parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))) return;
    const value = literalText(node);
    if (value === null) return;
    // Quoted values and attribute selectors are data, not structure: [data-part="x"] is fine.
    const bare = value
      .replace(/"[^"]*"|'[^']*'/g, "")
      .replace(/\[[^\]]*\]/g, "[]")
      .trim();
    if (bare.includes("/")) return;
    const at = where(source, node);
    if (/\.[A-Za-z_-]/.test(bare)) found.push(`${at} names a class: ${JSON.stringify(value)}`);
    if (/#[A-Za-z_-]/.test(bare)) found.push(`${at} names an id: ${JSON.stringify(value)}`);
    if (!(bare in elementSelectors) && elementTypes(bare)?.length)
      found.push(`${at} selects by element type: ${JSON.stringify(value)}`);
  });
  return found;
}

const contracts = "tests/e2e/support/contracts.ts";
const specs = sources("tests/e2e", (path) => path.endsWith(".spec.ts"));
const support = sources("tests/e2e/support", (path) => path.endsWith(".ts") && path !== contracts);

describe("end-to-end specs reach markup only through tests/e2e/support", () => {
  it("finds the specs and support modules it checks", () => {
    expect(specs.length).toBeGreaterThan(10);
    expect(support).toContain("tests/e2e/support/pages/shell.ts");
  });
  for (const path of specs)
    it(`${path} uses no raw selector, timeout or literal copy`, () => {
      const text = read(path);
      expect([...selectorFindings(path, text), ...copyFindings(path, text)]).toEqual([]);
    });
  for (const path of support)
    it(`${path} takes its selectors from contracts.ts`, () => {
      expect(selectorFindings(path, read(path))).toEqual([]);
    });
});

describe("contracts.ts names no styling hook", () => {
  it("contains no class, id or element-type selector outside the allowlist", () => {
    expect(contractFindings(contracts, read(contracts))).toEqual([]);
  });
  it("still uses every allowlisted element selector", () => {
    const strings = new Set<string>();
    visit(parse(contracts, read(contracts)), (node) => {
      const value = literalText(node);
      if (value !== null) strings.add(value);
    });
    expect(Object.keys(elementSelectors).filter((selector) => !strings.has(selector))).toEqual([]);
  });
});

describe("the convention checks themselves", () => {
  it("flag class, id and structural selectors and accept data-part, roles and data", () => {
    const flagged = [
      `const a = ".track-card";`,
      `const b = "#main-content";`,
      "const c = (x: string) => `${x} .track-actions button`;",
      `const d = "main p, .setting-row > span > span";`,
      'const e = (l: string) => `.language-switch a[lang="${l}"]`;',
      `const f = ".button.secondary.danger";`,
      `const g = "fieldset";`,
      'const h = (v: string) => `#admin-color option[value="${v}"]`;',
    ];
    for (const sample of flagged)
      expect(contractFindings("sample.ts", sample), sample).not.toEqual([]);
    const accepted = [
      'const a = (name: string) => `[data-part="${name}"]`;',
      `const b = ':focus'; const c = ":scope > *"; const d = '[role="dialog"]';`,
      `const e = "media/prepared/catalog.json"; const f = "**/_next/static/chunks/*.js";`,
      `const g = "A quiet beginning"; const h = '"DialogContentModal"'; const i = "hm:scene-start";`,
      'const j = (l: string) => `[lang="${l}"]`; const k = "calm-mode"; const l = "main";',
    ];
    for (const sample of accepted)
      expect(contractFindings("sample.ts", sample), sample).toEqual([]);
  });
  it("flag raw selectors, timeouts and literal copy in specs", () => {
    const flagged = [
      `page.locator(".player-bar");`,
      "page.locator(`#binaural-${channel}`);",
      `page.$$("[data-part=x]");`,
      `expectAccessible(page, ".sidebar");`,
      `page.waitForTimeout(500);`,
      `page.getByRole("button", { name: "Play" });`,
      `page.getByRole("button", { name: /Play/ });`,
      'page.getByRole("button", { name: `Play ${title}` });',
      `page.getByText("Loading");`,
      `page.getByLabel("Preset", { exact: true });`,
    ];
    for (const sample of flagged)
      expect(
        [...selectorFindings("sample.ts", sample), ...copyFindings("sample.ts", sample)],
        sample,
      ).not.toEqual([]);
    const accepted = [
      `page.locator(contracts.card.root); status.locator("option");`,
      `page.getByRole("button", { name: t("en", "player.play"), exact: true });`,
      'page.getByRole("button", { name: `${t(locale, "admin.edit")}: ${title}` });',
      `page.getByRole("heading", { level: 1 }); page.getByText(email, { exact: true });`,
      `expectAccessible(page, dialogs.role, { allRules: true });`,
    ];
    for (const sample of accepted)
      expect(
        [...selectorFindings("sample.ts", sample), ...copyFindings("sample.ts", sample)],
        sample,
      ).toEqual([]);
  });
});
