import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conventions that keep the end-to-end suite independent of styling, so a redesign that renames
// classes or restructures markup edits tests/e2e/support/ and never a spec.
//
// Specs (tests/e2e/**/*.spec.ts) and support modules other than contracts.ts (page objects and
// helpers) must not
// - write a selector: a string or template literal, or a constant of the same file holding one,
//   given to locator, $, $$, $eval, $$eval, waitForSelector, frameLocator, the in-page DOM methods
//   querySelector, querySelectorAll, closest and matches, or as the scope of expectAccessible or
//   axe, that names a class, an id or an element type, writes an attribute selector or uses a
//   Playwright selector engine (css=, xpath=, text=, >>, :has-text()). Selectors live in
//   contracts.ts and reach those calls by reference, joined in templates if need be;
// - assert a class or an id (toHaveClass or toHaveId with a literal, toHaveAttribute("class") or
//   toHaveAttribute("id")): a class name may only come from contracts.ts as data;
// - call waitForTimeout: wait for the state the test needs instead;
// - hold or count requests (holdRequests, holdChunk, watchChunk) in a spec that does not block
//   service workers with test.use({ serviceWorkers: "block" }): page.route does not see a request once
//   a service worker controls the page, so the hold is missed and the test waits out its timeout;
// - name an element by literal interface copy: a string, regular expression or template literal
//   with text as the `name` of getByRole, the text of getByText, getByLabel, getByPlaceholder,
//   getByAltText or getByTitle, or a hasText or hasNotText filter. Copy comes from the message
//   files through support/i18n.ts.
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
/** In-page DOM methods (inside evaluate callbacks) whose first argument is a CSS selector. */
const domSelectorMethods = new Set(["querySelector", "querySelectorAll", "closest", "matches"]);
/** Helpers whose second argument is a CSS scope. */
const scopedHelpers = new Set(["expectAccessible", "axe"]);
/** Assertions that read an element's class list or id. */
const styleAssertions = new Set(["toHaveClass", "toHaveId"]);
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
/** A selector with quoted values removed and every attribute selector collapsed to "[]". */
function bareSelector(value: string): string {
  return value
    .replace(/"[^"]*"|'[^']*'/g, "")
    .replace(/\[[^\]]*\]/g, "[]")
    .trim();
}

/**
 * What a selector names that a redesign may change: a class, an id, an element type, or a
 * Playwright selector engine (css=, xpath=, text=, >> chaining, the text pseudo-classes), through
 * which it can reach any of those. `allowlisted` accepts the element selectors of contracts.ts.
 */
function selectorProblems(value: string, { allowlisted }: { allowlisted: boolean }): string[] {
  const problems: string[] = [];
  if (
    /^\s*(?:\/\/|\.\.)|^\s*[a-z_][\w:-]*=|>>|:(?:has-text|text|text-is|text-matches)\(/i.test(value)
  )
    problems.push("uses a Playwright selector engine");
  const bare = bareSelector(value);
  if (/\.[A-Za-z_-]/.test(bare)) problems.push("names a class");
  if (/#[A-Za-z_-]/.test(bare)) problems.push("names an id");
  if (!(allowlisted && Object.hasOwn(elementSelectors, bare)) && elementTypes(bare)?.length)
    problems.push("selects by element type");
  return problems;
}

/** The string and template constants a file declares, so a selector held in one is checked. */
function constants(source: ts.SourceFile): Map<string, ts.Expression> {
  const found = new Map<string, ts.Expression>();
  visit(source, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const &&
      literalText(node.initializer) !== null
    )
      found.set(node.name.text, node.initializer);
  });
  return found;
}

/** Selectors, class or id assertions and waitForTimeout calls in a spec or support module. */
function selectorFindings(path: string, text: string): string[] {
  const source = parse(path, text);
  const declared = constants(source);
  const found: string[] = [];
  /**
   * A selector argument's text: a literal, a constant of this file holding one, or a `+` join of
   * those with other values, which read as `placeholder`. Null when no part is written here.
   */
  const selectorText = (node: ts.Node | undefined, placeholder: string): string | null => {
    if (!node) return null;
    if (ts.isParenthesizedExpression(node)) return selectorText(node.expression, placeholder);
    if (ts.isIdentifier(node)) {
      const constant = declared.get(node.text);
      return constant ? literalText(constant, placeholder) : null;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = selectorText(node.left, placeholder);
      const right = selectorText(node.right, placeholder);
      return left === null && right === null
        ? null
        : (left ?? placeholder) + (right ?? placeholder);
    }
    return literalText(node, placeholder);
  };
  /** Checks a selector-position argument for anything a selector may only name in contracts.ts. */
  const check = (argument: ts.Node | undefined, call: ts.Node, role: string) => {
    const value = selectorText(argument, "x");
    if (value === null) return;
    const problems = selectorProblems(value, { allowlisted: false });
    // Attribute selectors, data-part ones included, are written once, in contracts.ts.
    if ((selectorText(argument, " ") ?? "").includes("[")) problems.push("writes an attribute");
    for (const problem of problems)
      found.push(`${where(source, call)} ${role} ${problem}: ${JSON.stringify(value)}`);
  };
  visit(source, (node) => {
    if (ts.isIdentifier(node) && node.text === "waitForTimeout")
      found.push(`${where(source, node)} waits for a timeout instead of a state`);
    if (!ts.isCallExpression(node)) return;
    const name = calledName(node);
    if (!name) return;
    const [first, second] = node.arguments;
    if (selectorMethods.has(name) || domSelectorMethods.has(name))
      check(first, node, `gives ${name} a selector that`);
    if (scopedHelpers.has(name)) check(second, node, `gives ${name} a scope that`);
    const literalFirst =
      first !== undefined && (literalText(first) !== null || ts.isRegularExpressionLiteral(first));
    if (styleAssertions.has(name) && literalFirst)
      found.push(`${where(source, node)} asserts a class or id with ${name}`);
    if (name === "toHaveAttribute" && ["class", "id"].includes(literalText(first) ?? ""))
      found.push(`${where(source, node)} asserts the ${literalText(first)} attribute`);
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
    // locator(selector, { hasText }) and filter({ hasText }) match text as well.
    for (const argument of node.arguments)
      if (ts.isObjectLiteralExpression(argument))
        for (const property of argument.properties)
          if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            (property.name.text === "hasText" || property.name.text === "hasNotText") &&
            isLiteralCopy(property.initializer)
          )
            found.push(`${where(source, node)} filters by literal text with ${property.name.text}`);
  });
  return found;
}

/** The element types a selector uses, or null when the text is not shaped like a selector. */
/** Spec helpers that hold or count requests through page.route. */
const interceptingHelpers = new Set(["holdRequests", "holdChunk", "watchChunk"]);

/**
 * page.route does not see a request once a service worker controls the page, and the worker takes
 * over about half a second after the app loads. A spec that holds requests must block service
 * workers, or the hold is missed now and then (about one run in forty on a busy machine) and its
 * test waits out the whole timeout on a request that never reaches the route.
 */
function serviceWorkerFindings(path: string, text: string): string[] {
  const source = parse(path, text);
  const holds: ts.CallExpression[] = [];
  let blocked = false;
  visit(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calledName(node);
    if (name && interceptingHelpers.has(name)) holds.push(node);
    if (
      name === "use" &&
      node.arguments.some(
        (argument) =>
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(source) === "serviceWorkers" &&
              literalText(property.initializer) === "block",
          ),
      )
    )
      blocked = true;
  });
  return blocked
    ? []
    : holds.map(
        (call) =>
          `${where(source, call)} holds requests without test.use({ serviceWorkers: "block" })`,
      );
}
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
    // Quoted values and attribute selectors are data, not structure: [data-part="x"] is fine.
    // Strings with "/" outside them are paths, URLs or globs.
    if (value === null || bareSelector(value).includes("/")) return;
    for (const problem of selectorProblems(value, { allowlisted: true }))
      found.push(`${where(source, node)} ${problem}: ${JSON.stringify(value)}`);
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
  for (const path of specs)
    it(`${path} blocks service workers if it holds requests`, () => {
      expect(serviceWorkerFindings(path, read(path))).toEqual([]);
    });
  for (const path of support)
    it(`${path} takes its selectors from contracts.ts and its copy from the messages`, () => {
      const text = read(path);
      expect([...selectorFindings(path, text), ...copyFindings(path, text)]).toEqual([]);
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
  it("flag a spec that holds requests without blocking service workers", () => {
    const hold = `await holdRequests(page, "**/api/x");`;
    expect(serviceWorkerFindings("sample.ts", hold)).not.toEqual([]);
    expect(serviceWorkerFindings("sample.ts", `await holdChunk(page, "marker");`)).not.toEqual([]);
    expect(serviceWorkerFindings("sample.ts", `await watchChunk(page, "marker");`)).not.toEqual([]);
    // Allowing them, or blocking something else, is no block.
    expect(
      serviceWorkerFindings("sample.ts", `test.use({ serviceWorkers: "allow" }); ${hold}`),
    ).not.toEqual([]);
    expect(serviceWorkerFindings("sample.ts", `test.use({ locale: "vi" }); ${hold}`)).not.toEqual(
      [],
    );
    expect(
      serviceWorkerFindings("sample.ts", `test.use({ serviceWorkers: "block" }); ${hold}`),
    ).toEqual([]);
    expect(serviceWorkerFindings("sample.ts", `await page.goto("/en");`)).toEqual([]);
  });
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
  it("flag raw selectors, styling assertions, timeouts and literal copy in specs and helpers", () => {
    const flagged = [
      `page.locator(".player-bar");`,
      "page.locator(`#binaural-${channel}`);",
      `page.$$("[data-part=x]");`,
      `expectAccessible(page, ".sidebar");`,
      // A class, id or element type anywhere in the selector, not only at its start.
      "this.page.locator(`${main} .catalog-facets`);",
      "root.locator(`${card.root} .track-actions button`);",
      `page.locator("div.player-bar");`,
      `this.root.locator("fieldset");`,
      `expectAccessible(page, "main .sidebar");`,
      'root.locator(`${card.root}[aria-current="true"]`);',
      // Selector engines reach any styling hook.
      `page.locator("css=[data-x]");`,
      `page.locator("xpath=//div");`,
      `page.locator("//section");`,
      `page.locator(contracts.main + " >> " + x);`,
      `page.locator("text=Play");`,
      `page.locator("#binaural-" + channel);`,
      `page.locator(":has-text(Play)");`,
      // A selector held in a constant, or used inside the page.
      `const bar = ".player-bar"; page.locator(bar);`,
      `page.evaluate(() => document.querySelector(".track-card"));`,
      `element.closest("#main-content");`,
      // Class and id assertions.
      `await expect(app).toHaveClass("calm-mode");`,
      `await expect(app).toHaveClass(/calm/);`,
      `await expect(button).toHaveAttribute("class", /active/);`,
      `await expect(main).toHaveId("main-content");`,
      `page.waitForTimeout(500);`,
      `page.getByRole("button", { name: "Play" });`,
      `page.getByRole("button", { name: /Play/ });`,
      'page.getByRole("button", { name: `Play ${title}` });',
      `page.getByText("Loading");`,
      `page.getByLabel("Preset", { exact: true });`,
      `page.getByRole("status").filter({ hasText: "Loading" });`,
      `page.locator(contracts.card.root, { hasNotText: /Downloaded/ });`,
    ];
    for (const sample of flagged)
      expect(
        [...selectorFindings("sample.ts", sample), ...copyFindings("sample.ts", sample)],
        sample,
      ).not.toEqual([]);
    const accepted = [
      `page.locator(contracts.card.root); status.getByRole("option");`,
      "root.locator(`${card.root} ${card.title}`); page.locator(`${shell.main}:visible`);",
      `page.locator(":scope > *"); page.locator(audio); element.matches(trackCard);`,
      `page.evaluate((main) => document.querySelector(main), shell.main);`,
      `await expect(app).toHaveClass(new RegExp(shell.calmClass));`,
      `await expect(panel).not.toHaveAttribute("style", /transform/);`,
      `page.getByRole("status").filter({ hasText: wholePattern(locale, "common.loading") });`,
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
