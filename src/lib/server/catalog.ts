import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { stat } from "node:fs/promises";
import { supabaseUrl, supabaseKey, isConfigured } from "@/lib/supabase/config";
import { serverFetch } from "./transport";
import { decodeCursor, encodeCursor, paginateTracks } from "@/lib/catalog-query";
import { trackInput } from "@/lib/validation";
import type { CatalogPage, CatalogQuery, CuratedCollection, Track } from "@/lib/types";

export function localCatalogEnabled() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NODE_ENV !== "production" || process.env.LOCAL_CATALOG_ENABLED === "true")
  );
}
export function fromRow(row: Record<string, unknown>): Track {
  return trackInput.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    artist: row.artist,
    category: row.category,
    goals: row.goals,
    genres: row.genres ?? [],
    instruments: row.instruments ?? [],
    traditions: row.traditions ?? [],
    listeningReviewed: row.listening_reviewed ?? false,
    duration: row.duration,
    source: row.source,
    downloadAllowed: row.download_allowed,
    artwork: row.artwork,
    color: row.color,
    attribution: row.attribution,
    license: row.license,
    licenseUrl: row.license_url,
    provenanceUrl: row.provenance_url,
    status: row.status,
    rightsVerified: row.rights_verified,
    humanCreated: row.human_created,
    position: row.position,
    ...(row.bytes ? { bytes: row.bytes } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    ...(row.changes ? { changes: row.changes } : {}),
  }) as Track;
}
export function toRow(track: Track) {
  return {
    id: track.id,
    title: track.title,
    description: track.description,
    artist: track.artist,
    category: track.category,
    goals: track.goals,
    genres: track.genres ?? [],
    instruments: track.instruments ?? [],
    traditions: track.traditions ?? [],
    listening_reviewed: track.listeningReviewed ?? false,
    duration: track.duration,
    source: track.source,
    download_allowed: track.downloadAllowed,
    artwork: track.artwork,
    color: track.color,
    attribution: track.attribution,
    license: track.license,
    license_url: track.licenseUrl,
    provenance_url: track.provenanceUrl,
    status: track.status,
    rights_verified: track.rightsVerified,
    human_created: track.humanCreated,
    position: track.position,
    bytes: track.bytes ?? null,
    sha256: track.sha256 ?? null,
    changes: track.changes ?? "",
  };
}
function publicClient() {
  return isConfigured
    ? createClient(supabaseUrl!, supabaseKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: serverFetch },
        db: { retry: false, timeout: 5000 },
      })
    : null;
}
let localSnapshot: { modified: number; tracks: Track[] } | null = null;
async function localTracks(): Promise<Track[]> {
  if (!localCatalogEnabled()) return [];
  const path = join(process.cwd(), "media/prepared/catalog.json");
  const file = await stat(path).catch(() => null);
  if (!file) return [];
  if (localSnapshot?.modified === file.mtimeMs) return localSnapshot.tracks;
  const input = JSON.parse(await readFile(path, "utf8"));
  const tracks = input
    .map((track: Track) => trackInput.parse(track) as Track)
    .filter((track: Track) => track.status !== "retired");
  localSnapshot = { modified: file.mtimeMs, tracks };
  return tracks;
}
const cachedPage = unstable_cache(
  async (serialized: string): Promise<CatalogPage> => {
    const query = JSON.parse(serialized) as CatalogQuery;
    const db = publicClient();
    if (!db) return { items: [], total: 0, nextCursor: null };
    const cursor = decodeCursor(query.cursor);
    const { data, error } = await db.rpc("catalog_page", {
      p_query: { ...query, after_position: cursor?.position, after_id: cursor?.id },
      p_admin: false,
    });
    if (error || !data) throw new Error("Catalog unavailable");
    const result = data as { items: Record<string, unknown>[]; total: number; hasMore: boolean };
    const items = result.items.map(fromRow);
    return {
      items,
      total: result.total,
      nextCursor: result.hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
    };
  },
  ["published-catalog-v2", supabaseUrl || "local"],
  { tags: ["catalog"], revalidate: 60 },
);
export async function getCatalogPage(query: CatalogQuery = {}): Promise<CatalogPage> {
  if (localCatalogEnabled()) return paginateTracks(await localTracks(), query);
  return cachedPage(JSON.stringify(query));
}
export async function getTracksByIds(ids: string[], fresh = false): Promise<Track[]> {
  if (!ids.length || ids.length > 100) return [];
  if (localCatalogEnabled()) {
    const tracks = await localTracks();
    return ids.flatMap((id) => tracks.find((track) => track.id === id) || []);
  }
  const db = publicClient();
  if (!db) return [];
  const query = async () => {
    const { data, error } = await db
      .from("tracks")
      .select("*")
      .eq("status", "published")
      .in("id", ids);
    if (error) throw new Error("Track lookup unavailable");
    const tracks = (data || []).map(fromRow);
    return ids.flatMap((id) => tracks.find((track) => track.id === id) || []);
  };
  if (fresh) return query();
  return unstable_cache(query, ["published-track-ids", supabaseUrl!, ...ids], {
    tags: ["catalog"],
    revalidate: 60,
  })();
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
