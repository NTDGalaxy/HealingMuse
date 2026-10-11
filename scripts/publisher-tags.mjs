// Match publisher labels exactly. Do not infer a musical tradition from an artist or location.
export const publisherGenres = {
  African: "african",
  Blues: "blues",
  Classical: "classical",
  Contemporary: "contemporary",
  Disco: "disco",
  Electronica: "electronic",
  Funk: "funk",
  Holiday: "holiday",
  Jazz: "jazz",
  Latin: "latin",
  Modern: "modern",
  Musical: "musical",
  Polka: "polka",
  Pop: "pop",
  Reggae: "reggae",
  Rock: "rock",
  "Silent Film Score": "silent-film",
  Ska: "ska",
  Soundtrack: "soundtrack",
  World: "world",
  Urban: "urban",
};
export function parsePublisherGenres(html) {
  const match = /const genres\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!match)
    throw new Error("Publisher genre dictionary changed; classification requires review.");
  const rows = JSON.parse(match[1]);
  if (
    !Array.isArray(rows) ||
    rows.some((row) => !Number.isInteger(row.id) || typeof row.genre !== "string") ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new Error("Invalid publisher genre dictionary.");
  return new Map(rows.map((row) => [String(row.id), row.genre]));
}
export function genreTags(genreId, dictionary) {
  const tag = publisherGenres[dictionary.get(String(genreId))];
  return tag ? [tag] : [];
}
