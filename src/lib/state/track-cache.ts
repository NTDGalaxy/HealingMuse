import { api } from "@/lib/browser/api";
import type { Track } from "@/lib/types";
import { createStore, type ReadableStore } from "./create-store";

export const trackCacheLimit = 512;
export const trackBatchSize = 100;

/** Recordings seen during this visit, least recently registered first. */
export type TrackCacheSnapshot = Readonly<{
  byId: ReadonlyMap<string, Track>;
  list: Track[];
}>;

export type TrackCache = ReadableStore<TrackCacheSnapshot> & {
  getServerSnapshot(): TrackCacheSnapshot;
  get(id: string): Track | undefined;
  register(tracks: readonly Track[]): void;
  /** Fetches the recordings that are not cached yet, in batches the API accepts. */
  ensure(ids: readonly string[]): Promise<void>;
};

function snapshotOf(byId: Map<string, Track>): TrackCacheSnapshot {
  return { byId, list: [...byId.values()] };
}
function sameOrder(a: ReadonlyMap<string, Track>, b: ReadonlyMap<string, Track>) {
  if (a.size !== b.size) return false;
  const left = a.entries();
  for (const [id, track] of b) {
    const [otherId, other] = left.next().value!;
    if (id !== otherId || track !== other) return false;
  }
  return true;
}

export function createTrackCache(initial: readonly Track[] = []): TrackCache {
  const store = createStore(snapshotOf(new Map()));
  const register = (tracks: readonly Track[]) => {
    if (!tracks.length) return;
    const current = store.getSnapshot().byId;
    const next = new Map(current);
    for (const track of tracks) {
      next.delete(track.id);
      next.set(track.id, track);
    }
    while (next.size > trackCacheLimit) next.delete(next.keys().next().value!);
    // Re-registering what is already most recent (a re-run effect) changes nothing.
    if (!sameOrder(current, next)) store.set(snapshotOf(next));
  };
  register(initial);
  const initialSnapshot = store.getSnapshot();
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: store.subscribe,
    get: (id) => store.getSnapshot().byId.get(id),
    register,
    async ensure(ids) {
      const known = store.getSnapshot().byId;
      const missing = [...new Set(ids)].filter((id) => !known.has(id));
      for (let offset = 0; offset < missing.length; offset += trackBatchSize)
        register(
          await api<Track[]>(
            `/api/tracks?ids=${missing.slice(offset, offset + trackBatchSize).join(",")}`,
          ),
        );
    },
  };
}
