import { ApiError } from "@/lib/browser/api";
import {
  clearDownloads,
  downloadRecording,
  listDownloads,
  removeDownload,
} from "@/lib/browser/downloads";
import type { DownloadedTrack, Track } from "@/lib/types";
import { createStore, type ReadableStore } from "./create-store";

/** Message keys under downloads.* (rate_limited is errors.rate_limited). */
export type DownloadErrorCode =
  "storageFull" | "integrity" | "unsupported" | "interrupted" | "rate_limited";

export type DownloadsSnapshot = Readonly<{
  items: DownloadedTrack[];
  error: DownloadErrorCode | "";
}>;
export type DownloadProgress = Readonly<{ id: string; percent: number }> | null;
export type DownloadResult =
  | { status: "saved" }
  | { status: "busy" }
  | { status: "cancelled" }
  | { status: "failed"; code: DownloadErrorCode };

export type Downloads = {
  /** Saved recordings and the last download error. */
  records: ReadableStore<DownloadsSnapshot>;
  /** The download in progress; it changes with every chunk, so it has its own store. */
  progress: ReadableStore<DownloadProgress>;
  load(): Promise<void>;
  /** Saves one recording for offline listening; only one download runs at a time. */
  download(track: Track): Promise<DownloadResult>;
  /** Removes one saved recording, or all of them without an id. */
  remove(id?: string): Promise<void>;
  cancel(): void;
};

function failure(error: unknown): DownloadErrorCode {
  if (error instanceof ApiError && error.code === "rate_limited") return "rate_limited";
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "storageFull";
  if (error instanceof Error && error.message === "integrity") return "integrity";
  if (error instanceof Error && error.message === "unsupported") return "unsupported";
  return "interrupted";
}

export function createDownloads(): Downloads {
  const records = createStore<DownloadsSnapshot>({ items: [], error: "" });
  const progress = createStore<DownloadProgress>(null);
  let controller: AbortController | null = null;
  // Only the latest listing is applied, so a slow early read never hides a newer download.
  let listing = 0;
  const setError = (error: DownloadsSnapshot["error"]) =>
    records.set((current) => (current.error === error ? current : { ...current, error }));
  const relist = async () => {
    const version = ++listing;
    const items = await listDownloads();
    if (version === listing) records.set((current) => ({ ...current, items }));
  };
  return {
    records,
    progress,
    async load() {
      try {
        await relist();
      } catch {
        setError("unsupported");
      }
    },
    async download(track) {
      if (controller) return { status: "busy" };
      setError("");
      const current = new AbortController();
      controller = current;
      progress.set({ id: track.id, percent: 0 });
      try {
        await downloadRecording(
          track,
          (percent) =>
            progress.set((value) =>
              value?.id === track.id && value.percent === percent
                ? value
                : { id: track.id, percent },
            ),
          current.signal,
        );
        await relist();
        return { status: "saved" };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return { status: "cancelled" };
        const code = failure(error);
        setError(code);
        return { status: "failed", code };
      } finally {
        controller = null;
        progress.set(null);
      }
    },
    async remove(id) {
      try {
        if (id) await removeDownload(id);
        else await clearDownloads();
        await relist();
      } catch {
        setError("unsupported");
      }
    },
    cancel() {
      controller?.abort();
    },
  };
}
