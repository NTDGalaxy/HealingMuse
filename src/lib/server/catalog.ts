import "server-only";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { supabaseUrl, supabaseKey, isConfigured } from "@/lib/supabase/config";
import { serverFetch } from "./transport";
import { assertDb, HttpError } from "./http";
import { catalogQueryInput, decodeCursor, encodeCursor, paginateTracks } from "@/lib/catalog-query";
import { trackRecord } from "@/lib/validation";
import type { CatalogPage, CatalogQuery, CuratedCollection, Track } from "@/lib/types";

export function localCatalogEnabled() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NODE_ENV !== "production" || process.env.LOCAL_CATALOG_ENABLED === "true")
  );
}

/** Every Track field and its column. `satisfies` makes a missing or unknown field a type error. */
export const trackColumns = {
  id: "id",
  title: "title",
  description: "description",
  artist: "artist",
  category: "category",
  goals: "goals",
  genres: "genres",
  instruments: "instruments",
  traditions: "traditions",
  listeningReviewed: "listening_reviewed",
  duration: "duration",
  source: "source",
  downloadAllowed: "download_allowed",
  artwork: "artwork",
  color: "color",
  attribution: "attribution",
  license: "license",
  licenseUrl: "license_url",
  provenanceUrl: "provenance_url",
  status: "status",
  rightsVerified: "rights_verified",
  humanCreated: "human_created",
  position: "position",
  bytes: "bytes",
  sha256: "sha256",
  changes: "changes",
} as const satisfies { [K in keyof Track]-?: string };
type Field = keyof typeof trackColumns;
/** Optional fields that count as absent when their stored value is empty (0, "" or null). */
const absentWhenEmpty = new Set<Field>(["bytes", "sha256", "changes"]);
/** Values written for fields a Track may leave undefined. */
const storedDefaults: Partial<Record<Field, unknown>> = {
  genres: [],
  instruments: [],
  traditions: [],
  listeningReviewed: false,
  bytes: null,
  sha256: null,
  changes: "",
};

export function fromRow(row: Record<string, unknown>): Track {
  const input: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(trackColumns) as [Field, string][]) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (absentWhenEmpty.has(field) && !value) continue;
    input[field] = value;
  }
  return trackRecord.parse(input);
}
export function toRow(track: Track) {
  return Object.fromEntries(
    (Object.entries(trackColumns) as [Field, string][]).map(([field, column]) => [
      column,
      track[field] ?? storedDefaults[field],
    ]),
  );
}

let client: SupabaseClient | null | undefined;
/** Publishable-key client for public catalogue reads; publication RLS applies. */
function publicClient() {
  if (client === undefined)
    client = isConfigured
      ? createClient(supabaseUrl!, supabaseKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: serverFetch },
          db: { retry: false, timeout: 5000 },
        })
      : null;
  return client;
}

/** One catalog_page call for the public cache and the admin review queue. */
export async function catalogPage(
  db: SupabaseClient,
  query: CatalogQuery,
  admin: boolean,
): Promise<CatalogPage> {
  let cursor;
  try {
    cursor = decodeCursor(query.cursor);
  } catch {
    throw new HttpError(400, "invalid");
  }
  const { data, error } = await db.rpc("catalog_page", {
    p_query: { ...query, after_position: cursor?.position, after_id: cursor?.id },
    p_admin: admin,
  });
  assertDb(error);
  if (!data) throw new HttpError(503, "unavailable", "db");
  const result = data as { items: Record<string, unknown>[]; total: number; hasMore: boolean };
  const items = result.items.map(fromRow);
  return {
    items,
    total: result.total,
    nextCursor: result.hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
  };
}

let localSnapshot: { modified: number; tracks: Track[] } | null = null;
async function localTracks(): Promise<Track[]> {
  if (!localCatalogEnabled()) return [];
  const path = join(process.cwd(), "media/prepared/catalog.json");
  const file = await stat(path).catch(() => null);
  if (!file) return [];
  if (localSnapshot?.modified === file.mtimeMs) return localSnapshot.tracks;
  const input: unknown[] = JSON.parse(await readFile(path, "utf8"));
  const tracks = input
    .map((track) => trackRecord.parse(track))
    .filter((track) => track.status !== "retired");
  localSnapshot = { modified: file.mtimeMs, tracks };
  return tracks;
}

const cachedPage = unstable_cache(
  async (serialized: string): Promise<CatalogPage> => {
    const db = publicClient();
    if (!db) return { items: [], total: 0, nextCursor: null };
    return catalogPage(db, JSON.parse(serialized) as CatalogQuery, false);
  },
  ["published-catalog-v2", supabaseUrl || "local"],
  { tags: ["catalog"], revalidate: 60 },
);
/** Equivalent queries share one cache entry: defaults are applied before the key is built. */
function cacheKey(query: CatalogQuery) {
  const parsed = catalogQueryInput.safeParse(query);
  return JSON.stringify(parsed.success ? parsed.data : query);
}
export async function getCatalogPage(query: CatalogQuery = {}): Promise<CatalogPage> {
  if (localCatalogEnabled()) return paginateTracks(await localTracks(), query);
  return cachedPage(cacheKey(query));
}

export async function getTracksByIds(ids: string[], fresh = false): Promise<Track[]> {
  if (!ids.length || ids.length > 100) return [];
  const inOrder = (tracks: Track[]) =>
    ids.flatMap((id) => tracks.find((track) => track.id === id) || []);
  if (localCatalogEnabled()) return inOrder(await localTracks());
  const db = publicClient();
  if (!db) return [];
  // Sorted ids give one cache entry per set, whatever order callers ask in.
  const sorted = [...ids].sort();
  const query = async () => {
    const { data, error } = await db
      .from("tracks")
      .select("*")
      .eq("status", "published")
      .in("id", sorted);
    if (error) throw new Error("Track lookup unavailable");
    return (data || []).map(fromRow);
  };
  if (fresh) return inOrder(await query());
  return inOrder(
    await unstable_cache(query, ["published-track-ids", supabaseUrl!, ...sorted], {
      tags: ["catalog"],
      revalidate: 60,
    })(),
  );
}
export async function getTrack(id: string): Promise<Track | null> {
  return (await getTracksByIds([id], true))[0] || null;
}

const cachedCollections = unstable_cache(
  async (): Promise<CuratedCollection[]> => {
    const db = publicClient();
    if (!db) return [];
    const { data, error } = await db
      .from("curated_collections")
      .select("id,title,goal,revision,published,curated_collection_items(track_id,position)")
      .eq("published", true)
      .order("position")
      .limit(24);
    if (error) throw new Error("Collections unavailable");
    return (data || []).map((row) => ({
      ...row,
      trackIds: row.curated_collection_items
        .sort((a, b) => a.position - b.position)
        .map((item) => item.track_id),
    })) as CuratedCollection[];
  },
  ["published-collections-v2", supabaseUrl || "local"],
  { tags: ["catalog"], revalidate: 60 },
);
export async function getCollections() {
  return localCatalogEnabled() ? [] : cachedCollections();
}
