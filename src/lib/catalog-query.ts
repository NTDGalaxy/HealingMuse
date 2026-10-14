import { z } from "zod";
import type { CatalogPage, CatalogQuery, Track } from "./types";

import { taxonomy } from "./catalog-taxonomy";
export { taxonomy } from "./catalog-taxonomy";
const optionalFilter = (values: readonly string[]) =>
  z
    .string()
    .default("")
    .refine((value) => !value || values.includes(value));
export const catalogQueryInput = z
  .object({
    q: z.string().trim().max(120).default(""),
    goal: optionalFilter(["relax", "rest", "focus"]),
    category: optionalFilter(["instrumental", "nature"]),
    genre: optionalFilter(taxonomy.genre),
    instrument: optionalFilter(taxonomy.instrument),
    tradition: optionalFilter(taxonomy.tradition),
    collection: z.union([z.uuid(), z.literal("")]).default(""),
    cursor: z
      .string()
      .max(160)
      .regex(/^[A-Za-z0-9_-]*$/)
      .default(""),
    limit: z.coerce.number().int().min(1).max(48).default(24),
    status: optionalFilter(["draft", "published", "retired"]),
  })
  .strict();
export function foldSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
export function decodeCursor(cursor = "") {
  if (!cursor) return null;
  const decoded = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
  const match = /^(\d{1,5}):([0-9a-f-]{36})$/.exec(decoded);
  if (!match || !z.uuid().safeParse(match[2]).success || Number(match[1]) > 10000)
    throw new Error("Invalid catalogue cursor");
  return { position: Number(match[1]), id: match[2] };
}
export function encodeCursor(track: Track) {
  return btoa(`${track.position}:${track.id}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function paginateTracks(
  all: Track[],
  query: CatalogQuery,
  collectionIds?: string[],
): CatalogPage {
  const search = foldSearch(query.q || "");
  const selected = collectionIds ? new Set(collectionIds) : null;
  const filtered = all
    .filter(
      (track) =>
        (!query.status || track.status === query.status) &&
        (!query.goal || track.goals.includes(query.goal as Track["goals"][number])) &&
        (!query.category || track.category === query.category) &&
        (!query.genre || track.genres?.includes(query.genre)) &&
        (!query.instrument || track.instruments?.includes(query.instrument)) &&
        (!query.tradition || track.traditions?.includes(query.tradition)) &&
        (!selected || selected.has(track.id)) &&
        (!search ||
          foldSearch(
            `${track.title.vi} ${track.title.en} ${track.description.vi} ${track.description.en} ${track.artist}`,
          ).includes(search)),
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const cursor = decodeCursor(query.cursor);
  const remaining = cursor
    ? filtered.filter(
        (track) =>
          track.position > cursor.position ||
          (track.position === cursor.position && track.id > cursor.id),
      )
    : filtered;
  const items = remaining.slice(0, query.limit || 24);
  return {
    items,
    total: filtered.length,
    nextCursor: remaining.length > items.length ? encodeCursor(items[items.length - 1]) : null,
  };
}
