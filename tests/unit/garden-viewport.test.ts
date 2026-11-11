import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perFrame, watchViewport, type FrameScheduler } from "../../src/lib/garden/viewport";

function fakeFrames() {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  const frames: FrameScheduler = {
    request(callback) {
      callbacks.set(next, callback);
      return next++;
    },
    cancel: (handle) => void callbacks.delete(handle),
  };
  const flush = () => {
    const due = [...callbacks.values()];
    callbacks.clear();
    due.forEach((callback) => callback());
  };
  return { frames, flush, pending: () => callbacks.size };
}

describe("per-frame coalescing", () => {
  it("applies once per frame however often it is scheduled", () => {
    const { frames, flush, pending } = fakeFrames();
    const apply = vi.fn();
    const update = perFrame(apply, frames);
    update.schedule();
    update.schedule();
    update.schedule();
    expect(pending()).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    flush();
    expect(apply).toHaveBeenCalledTimes(1);
    update.schedule();
    flush();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending frame", () => {
    const { frames, flush, pending } = fakeFrames();
    const apply = vi.fn();
    const update = perFrame(apply, frames);
    update.schedule();
    update.cancel();
    expect(pending()).toBe(0);
    flush();
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("viewport watching", () => {
  const listeners = new Map<string, Set<() => void>>();
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const queries: { media: string; listeners: Set<() => void> }[] = [];
  beforeEach(() => {
    listeners.clear();
    queries.length = 0;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    vi.stubGlobal("devicePixelRatio", 2);
    vi.stubGlobal("matchMedia", (media: string) => {
      const query = { media, listeners: new Set<() => void>() };
      queries.push(query);
      return {
        addEventListener: (_: string, listener: () => void) => query.listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => query.listeners.delete(listener),
      };
    });
    vi.stubGlobal("addEventListener", (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    });
    vi.stubGlobal("removeEventListener", (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports one resize per frame with the latest size", () => {
    const { frames, flush } = fakeFrames();
    const seen: unknown[] = [];
    watchViewport((viewport) => seen.push(viewport), frames);
    fire("resize");
    vi.stubGlobal("innerWidth", 800);
    fire("resize");
    vi.stubGlobal("innerHeight", 600);
    fire("resize");
    expect(seen).toEqual([]);
    flush();
    expect(seen).toEqual([{ width: 800, height: 600, devicePixelRatio: 2 }]);
  });

  it("follows a change of pixel density without a resize", () => {
    const { frames, flush } = fakeFrames();
    const seen: unknown[] = [];
    watchViewport((viewport) => seen.push(viewport), frames);
    expect(queries.map((query) => query.media)).toEqual(["(resolution: 2dppx)"]);
    vi.stubGlobal("devicePixelRatio", 1);
    queries[0].listeners.forEach((listener) => listener());
    flush();
    expect(seen).toEqual([{ width: 390, height: 844, devicePixelRatio: 1 }]);
    expect(queries.map((query) => query.media)).toEqual([
      "(resolution: 2dppx)",
      "(resolution: 1dppx)",
    ]);
    expect(queries[0].listeners.size).toBe(0);
    expect(queries[1].listeners.size).toBe(1);
  });

  it("stops listening and drops a pending frame on cleanup", () => {
    const { frames, flush } = fakeFrames();
    const onChange = vi.fn();
    const stop = watchViewport(onChange, frames);
    fire("resize");
    stop();
    flush();
    fire("resize");
    flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(listeners.get("resize")?.size ?? 0).toBe(0);
    expect(queries.every((query) => query.listeners.size === 0)).toBe(true);
  });
});
