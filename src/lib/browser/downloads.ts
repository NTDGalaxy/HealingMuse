import type { DownloadedTrack, PlaybackGrant, Track } from "@/lib/types";
import { api } from "./api";

const DB_NAME = "healingmuse-downloads";
const STORE = "recordings";
const MAX_BYTES = 50 * 1024 * 1024;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("unsupported"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onerror = () => reject(new Error("unsupported"));
    request.onblocked = () => reject(new Error("unsupported"));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      const transaction = tx;
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? request.error ?? new Error("unsupported"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error("interrupted"));
      };
    } catch (error) {
      try {
        tx?.abort();
      } catch {
        /* An already finished transaction needs no abort. */
      }
      db.close();
      reject(error);
    }
  });
}
export const listDownloads = () =>
  transact<DownloadedTrack[]>("readonly", (store) => store.getAll());
export const getDownload = (id: string) =>
  transact<DownloadedTrack | undefined>("readonly", (store) => store.get(id));
export const removeDownload = (id: string) => transact("readwrite", (store) => store.delete(id));
export const clearDownloads = () => transact("readwrite", (store) => store.clear());

export async function downloadRecording(
  track: Track,
  progress: (value: number) => void,
  signal: AbortSignal,
) {
  if (track.source.kind !== "hosted" || !track.downloadAllowed || track.status !== "published")
    throw new Error("ineligible");
  const grant = await api<PlaybackGrant>(`/api/grants/${track.id}?download=1`, { signal });
  const response = await fetch(grant.url, {
    signal,
    cache: "no-store",
    credentials:
      new URL(grant.url, location.href).origin === location.origin ? "same-origin" : "omit",
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("audio/"))
    throw new Error("interrupted");
  const expected =
    grant.bytes ?? (Number(response.headers.get("content-length")) || track.bytes || 0);
  if (expected > MAX_BYTES) throw new Error("storage_full");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("storage_full");
      chunks.push(new Uint8Array(value));
      progress(expected ? Math.min(99, Math.round((bytes / expected) * 100)) : 0);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (!bytes || (expected && bytes !== expected)) throw new Error("integrity");
  const blob = new Blob(chunks, { type: "audio/mpeg" });
  if (grant.sha256) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== grant.sha256) throw new Error("integrity");
  }
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  // Never persist account data, credentials, signed URLs, or partially fetched audio.
  await transact("readwrite", (store) =>
    store.put({
      id: track.id,
      track,
      blob,
      downloadedAt: new Date().toISOString(),
      bytes,
    } satisfies DownloadedTrack),
  );
  progress(100);
}
