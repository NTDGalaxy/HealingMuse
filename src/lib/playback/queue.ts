import type { CatalogPage, CatalogQuery, Track } from "@/lib/types";

// Pure queue rules. The native player only plays hosted recordings, so only those can follow
// one another; external recordings open their own dialog instead.

export const isPlayable = (track: Track) => track.source.kind === "hosted";

/**
 * The queue for a play request: the list the listener sees, or the recording alone when it is
 * shown without a list. Never every recording seen during the visit, which once let Downloads
 * step into streamed recordings while offline.
 */
export function queueFor(track: Track, visible?: readonly Track[]): Track[] {
  return (visible ?? [track]).filter(isPlayable);
}

export type Step =
  | { kind: "play"; track: Track }
  /** Past the end of the queue with a catalogue continuation: fetch the next page. */
  | { kind: "continue" }
  | { kind: "end" };

/** Where skipping by `offset` from the current recording leads. */
export function step(
  queue: readonly Track[],
  currentId: string | undefined,
  offset: number,
  { repeat, canContinue }: { repeat: boolean; canContinue: boolean },
): Step {
  const index = queue.findIndex((track) => track.id === currentId);
  const target = index + offset;
  if (target >= 0 && target < queue.length) return { kind: "play", track: queue[target] };
  if (offset > 0 && canContinue) return { kind: "continue" };
  if (repeat && queue.length)
    return { kind: "play", track: queue[(target + queue.length) % queue.length] };
  return { kind: "end" };
}

/** The catalogue search that fetches the page a continuation points at. */
export function continuationSearch(query: CatalogQuery): URLSearchParams {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) parameters.set(key, String(value));
  return parameters;
}

/**
 * Extends a queue with a fetched catalogue page: the playable recordings it does not hold yet,
 * and the continuation for the page after, if there is one.
 */
export function extend(queue: readonly Track[], query: CatalogQuery, page: CatalogPage) {
  const incoming = page.items.filter(
    (track) => isPlayable(track) && !queue.some((known) => known.id === track.id),
  );
  return {
    incoming,
    queue: [...queue, ...incoming],
    continuation: page.nextCursor ? { ...query, cursor: page.nextCursor } : null,
  };
}
