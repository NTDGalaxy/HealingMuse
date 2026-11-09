import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../src/messages/en.json";
import { Button, buttonClass } from "../../src/components/ui/button";
import { EmptyState } from "../../src/components/ui/empty-state";
import { ErrorState } from "../../src/components/ui/error-state";
import { CheckboxField, SelectField, TextField } from "../../src/components/ui/field";
import { InlineAlert } from "../../src/components/ui/inline-alert";
import { PageHeader } from "../../src/components/ui/page-header";
import { Pagination } from "../../src/components/ui/pagination";
import { moveItem, ReorderableList } from "../../src/components/ui/reorderable-list";
import { SearchField } from "../../src/components/ui/search-field";

// The primitives replaced hand-written markup that the stylesheets, the end-to-end contracts and
// the visual oracle depend on, so their exact output is pinned here.
const html = (element: ReactElement) =>
  renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Ho_Chi_Minh",
      children: element,
    }),
  );
const none = () => {};
/** The sorted attributes of the first `tag` element; React may emit them in another order. */
const attributes = (markup: string, tag: string) =>
  [...(new RegExp(`<${tag} ([^>]*?)/?>`).exec(markup)?.[1] ?? "").matchAll(/[\w-]+="[^"]*"/g)]
    .map((match) => match[0])
    .sort();

describe("Button", () => {
  it("builds the class list in the order the stylesheets were written for", () => {
    expect(buttonClass()).toBe("button");
    expect(buttonClass({ variant: "secondary" })).toBe("button secondary");
    expect(buttonClass({ danger: true })).toBe("button danger");
    expect(buttonClass({ variant: "secondary", danger: true })).toBe("button secondary danger");
  });
  it("passes every other attribute to the button", () => {
    expect(html(h(Button, { variant: "secondary", type: "button", disabled: true }, "Save"))).toBe(
      '<button class="button secondary" type="button" disabled="">Save</button>',
    );
  });
});

describe("content states", () => {
  it("renders the page header, empty state, error state and inline alert", () => {
    expect(html(h(PageHeader, { title: "Library", subtitle: "Kept close" }))).toBe(
      '<div class="page-heading"><h1>Library</h1><p>Kept close</p></div>',
    );
    const empty = html(h(EmptyState, { title: "Nothing yet" }, h("button", null, "Go")));
    expect(empty).toMatch(/^<div class="empty-state"><svg [^>]*aria-hidden="true"/);
    expect(empty).toMatch(/<\/svg><h2>Nothing yet<\/h2><button>Go<\/button><\/div>$/);
    expect(html(h(EmptyState, { title: "None", text: "Later" }))).toMatch(
      /<h2>None<\/h2><p>Later<\/p><\/div>$/,
    );
    expect(
      html(h(ErrorState, { message: "Unavailable", action: h("button", null, "Retry") })),
    ).toBe('<div class="info-panel" role="alert"><p>Unavailable</p><button>Retry</button></div>');
    expect(html(h(InlineAlert, { id: "auth-error", children: "Wrong code" }))).toBe(
      '<p id="auth-error" class="error" role="alert">Wrong code</p>',
    );
  });
});

describe("field family", () => {
  it("renders each label immediately before its control", () => {
    expect(html(h(TextField, { id: "name", label: "Name", required: true }))).toBe(
      '<label for="name">Name</label><input id="name" required=""/>',
    );
    expect(
      html(
        h(
          SelectField,
          { id: "goal", label: "Goal", value: "rest", onChange: none },
          h("option", { value: "rest" }, "Rest"),
        ),
      ),
    ).toBe(
      '<label for="goal">Goal</label><select id="goal"><option value="rest" selected="">Rest</option></select>',
    );
    expect(html(h(CheckboxField, { label: "Agree", name: "agree" }))).toBe(
      '<label class="check-label"><input type="checkbox" name="agree"/>Agree</label>',
    );
    expect(html(h(CheckboxField, { label: "Rights", row: true }))).toBe(
      '<label class="check-row"><input type="checkbox"/>Rights</label>',
    );
  });
  it("renders a search form around the q input", () => {
    const form = html(
      h(SearchField, {
        id: "home-search",
        label: "Search",
        placeholder: "Title or artist",
        className: "discovery-search",
        iconSize: 22,
        submitType: "submit",
        action: "/en/explore",
      }),
    );
    expect(form).toMatch(/^<form class="search-box discovery-search" action="\/en\/explore"><svg /);
    expect(form).toMatch(/<\/svg><label class="sr-only" for="home-search">Search<\/label><input /);
    expect(attributes(form, "input")).toEqual([
      'id="home-search"',
      'maxLength="120"',
      'name="q"',
      'placeholder="Title or artist"',
      'type="search"',
    ]);
    expect(form).toMatch(/\/><button class="button" type="submit">Search<\/button><\/form>$/);
    const plain = html(
      h(SearchField, { id: "review-search", label: "Search", placeholder: "Find" }),
    );
    expect(plain).toMatch(
      /^<form class="search-box"><label class="sr-only" for="review-search">Search<\/label><input /,
    );
    expect(plain).toMatch(/\/><button class="button">Search<\/button><\/form>$/);
  });
});

describe("Pagination", () => {
  it("is a named landmark with a label and a plain group without one", () => {
    expect(
      html(
        h(Pagination, {
          label: "Pages",
          back: { label: "Back", onClick: none },
          next: { label: "Next", onClick: none, disabled: true },
        }),
      ),
    ).toBe(
      '<nav class="catalog-pagination" aria-label="Pages"><button class="button secondary">Back</button><button class="button" disabled="">Next</button></nav>',
    );
    expect(
      html(
        h(Pagination, {
          back: false,
          next: { label: "Next", onClick: none },
          nextVariant: "secondary",
        }),
      ),
    ).toBe('<div class="catalog-pagination"><button class="button secondary">Next</button></div>');
  });
});

describe("ReorderableList", () => {
  it("swaps neighbours and ignores moves past either end", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
  it("labels every control with its item and disables moves past the ends", () => {
    const list = html(
      h(ReorderableList, {
        items: [
          { id: "a", label: "Rain" },
          { id: "b", label: "River" },
        ],
        onChange: none,
        iconSize: 17,
      }),
    );
    expect(list.startsWith('<ol class="edit-list"><li><span>Rain</span>')).toBe(true);
    const buttons = [...list.matchAll(/<button ([^>]*)>/g)].map((match) => match[1]);
    expect(buttons).toEqual([
      'type="button" class="icon-button" disabled="" aria-label="Move Rain up"',
      'type="button" class="icon-button" aria-label="Move Rain down"',
      'type="button" class="icon-button" aria-label="Remove: Rain"',
      'type="button" class="icon-button" aria-label="Move River up"',
      'type="button" class="icon-button" disabled="" aria-label="Move River down"',
      'type="button" class="icon-button" aria-label="Remove: River"',
    ]);
    expect(list).toContain('width="17"');
  });
});
