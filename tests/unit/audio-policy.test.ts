import { it, expect } from "vitest";
import { isDerivativeRecording, normalizedLicenseUrl } from "../../scripts/audio-common.mjs";
import { genreTags, parsePublisherGenres } from "../../scripts/publisher-tags.mjs";
it("excludes shortened originals and loops without rejecting unrelated titles", () => {
  for (const title of [
    "Easy Lemon (30 second)",
    "Easy Lemon 60 seconds",
    "River loop",
    "Song excerpt",
  ])
    expect(isDerivativeRecording(title)).toBe(true);
  for (const title of ["Easy Lemon", "Second Thoughts", "River in Spring"])
    expect(isDerivativeRecording(title)).toBe(false);
});
it("upgrades retained Creative Commons links without accepting insecure evidence hosts", () => {
  expect(normalizedLicenseUrl("http://creativecommons.org/licenses/by/3.0/")).toBe(
    "https://creativecommons.org/licenses/by/3.0/",
  );
  expect(() => normalizedLicenseUrl("http://untrusted.invalid/licenses/by/4.0/")).toThrow();
});
it("classifies only validated publisher dictionary entries without evaluating scripts", () => {
  const dictionary = parsePublisherGenres(
    'const genres = [{"id":7,"genre":"Electronica"},{"id":22,"genre":"Soundtrack"},{"id":10,"genre":"Horror"}];',
  );
  expect(genreTags("7", dictionary)).toEqual(["electronic"]);
  expect(genreTags(22, dictionary)).toEqual(["soundtrack"]);
  expect(genreTags(10, dictionary)).toEqual([]);
  expect(genreTags("missing", dictionary)).toEqual([]);
  expect(() => parsePublisherGenres("const genres = [executeCode()];")).toThrow();
  expect(() =>
    parsePublisherGenres('const genres = [{"id":7,"genre":"Jazz"},{"id":7,"genre":"World"}];'),
  ).toThrow();
});
