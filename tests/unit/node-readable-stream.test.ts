import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { cancellableWebStream } from "@/lib/node-readable-stream";

describe("cancellable file response streams", () => {
  it("delivers every byte in order and closes the source", async () => {
    const source = Readable.from([Buffer.from("first"), Buffer.from("second")]);
    const body = await new Response(cancellableWebStream(source)).text();
    expect(body).toBe("firstsecond");
    expect(source.destroyed).toBe(true);
  });

  it("cancels a pending pull without enqueueing into the closed consumer", async () => {
    let release!: () => void;
    const source = Readable.from(
      (async function* () {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        yield Buffer.from("late audio chunk");
      })(),
    );
    const reader = cancellableWebStream(source).getReader();
    const pending = reader.read();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const cancellation = reader.cancel();
    release();
    await cancellation;
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(source.destroyed).toBe(true);
  });

  it("reports genuine source read errors to an active consumer", async () => {
    const failure = new Error("file_read_failed");
    const source = new Readable({
      read() {
        this.destroy(failure);
      },
    });
    await expect(cancellableWebStream(source).getReader().read()).rejects.toBe(failure);
    expect(source.destroyed).toBe(true);
  });
});
