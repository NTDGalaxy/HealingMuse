import type { CatalogQuery, Track } from "./types";

export function foldSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
export function catalogMatcher(query: CatalogQuery) {
  const search = foldSearch(query.q || "");
  return (track: Track) =>
    Boolean(
      (!query.status || track.status === query.status) &&
      (!query.goal || track.goals.includes(query.goal as Track["goals"][number])) &&
      (!query.category || track.category === query.category) &&
      (!query.genre || track.genres?.includes(query.genre)) &&
      (!query.instrument || track.instruments?.includes(query.instrument)) &&
      (!query.tradition || track.traditions?.includes(query.tradition)) &&
      (!search ||
        foldSearch(
          `${track.title.vi} ${track.title.en} ${track.description.vi} ${track.description.en} ${track.artist}`,
        ).includes(search)),
    );
}
