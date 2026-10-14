import type { Readable } from "node:stream";

// Pull from the file instead of forwarding flowing data events after cancellation.
export function cancellableWebStream(source: Readable): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (cancelled) return;
        if (result.done) controller.close();
        else controller.enqueue(result.value as Uint8Array);
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      source.destroy();
      // A pending iterator read rejects when its underlying file is destroyed.
      // The cancelled consumer cannot receive that error, but the iterator must settle.
      await iterator.return?.().catch(() => {});
    },
  });
}
