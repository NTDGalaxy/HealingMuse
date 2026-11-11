import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogPage, Track } from "@/lib/types";
import { beginPlaybackStart, playbackStarting } from "@/lib/perf/audio-first";
import {
  createPlaybackEngine,
  type AudioOutput,
  type PlaybackDeps,
  type PlayerAnnouncement,
} from "@/lib/playback/engine";
import { continuationSearch, extend, queueFor, step } from "@/lib/playback/queue";
import { createSleepTimer } from "@/lib/playback/sleep-timer";
import { createAudioFocus } from "@/lib/playback/audio-focus";
import { setMediaActions, transportActions } from "@/lib/playback/media-session";
import { createListeningSessions } from "@/lib/playback/session-machine";

/**
 * A media element that follows HTMLMediaElement where the engine depends on it: play() rejects
 * without a source and, while `buffering`, stays pending until `ready()`; pause() and load()
 * reject pending play() requests with an AbortError in a later task. `refusePlay` simulates an
 * autoplay block.
 */
class FakeAudio extends EventTarget implements AudioOutput {
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  error: unknown = null;
  volume = 1;
  muted = false;
  refusePlay = false;
  buffering = false;
  private source: string | null = null;
  private pending: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  get src() {
    return this.source ?? "";
  }
  set src(value: string) {
    this.source = value;
  }
  getAttribute(name: string) {
    return name === "src" ? this.source : null;
  }
  removeAttribute(name: string) {
    if (name === "src") this.source = null;
  }
  load() {
    this.paused = true;
    this.abortPending();
  }
  play(): Promise<void> {
    if (this.refusePlay) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    if (this.source === null)
      return Promise.reject(new DOMException("no source", "NotSupportedError"));
    if (this.paused) {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    }
    if (!this.buffering) return Promise.resolve();
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
  /** Enough media has arrived: pending play() requests resolve. */
  ready() {
    this.buffering = false;
    for (const request of this.pending.splice(0)) request.resolve();
  }
  pause() {
    this.abortPending();
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }
  private abortPending() {
    const interrupted = this.pending.splice(0);
    if (!interrupted.length) return;
    setTimeout(() => {
      for (const request of interrupted)
        request.reject(new DOMException("The play() request was interrupted", "AbortError"));
    });
  }
}

function recording(id: string, kind: "hosted" | "youtube" = "hosted"): Track {
  return {
    id,
    title: { en: id, vi: id },
    artist: "Artist",
    duration: 100,
    source: kind === "hosted" ? { kind, path: `${id}.mp3` } : { kind, videoId: id },
  } as unknown as Track;
}
const a = recording("a");
const b = recording("b");
const c = recording("c");
const video = recording("video", "youtube");

/** Lets every pending promise chain settle, including work queued in a later task. */
const flush = () =>
  new Promise((resolve) => setTimeout(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<PlaybackDeps> = {}) {
  const audio = new FakeAudio();
  const page = new EventTarget();
  const calls = {
    grants: [] as string[],
    announced: [] as PlayerAnnouncement[],
    opened: [] as { trackId: string; beforeScore?: number; owner: string }[],
    closed: [] as string[],
    created: [] as string[],
    revoked: [] as string[],
    registered: [] as Track[],
    searches: [] as string[],
    failed: 0,
  };
  const deps: PlaybackDeps = {
    downloaded: () => undefined,
    async grant(id) {
      calls.grants.push(id);
      return `grant:${id}`;
    },
    async catalogPage(search) {
      calls.searches.push(search.toString());
      return { items: [], total: 0, nextCursor: null };
    },
    registerTracks: (tracks) => calls.registered.push(...tracks),
    sessionRequests: {
      async open(trackId, beforeScore, owner) {
        calls.opened.push({ trackId, beforeScore, owner });
        return `session-${calls.opened.length}`;
      },
      async close(sessionId) {
        calls.closed.push(sessionId);
      },
    },
    userId: () => null,
    moodConsent: () => false,
    online: () => true,
    announce: (key) => calls.announced.push(key),
    failed: () => calls.failed++,
    beginPlaybackStart,
    objectUrl: {
      create: () => {
        const url = `blob:${calls.created.length + 1}`;
        calls.created.push(url);
        return url;
      },
      revoke: (url) => calls.revoked.push(url),
    },
    privacy: { owner: null, consent: false },
    ...overrides,
  };
  const engine = createPlaybackEngine(deps);
  const detach = engine.attach(audio, page);
  return { engine, audio, page, calls, detach };
}

afterEach(() => {
  vi.useRealTimers();
  // Every start reported to the audio-first contract must have settled.
  expect(playbackStarting()).toBe(false);
});

describe("queue rules", () => {
  it("queues the visible list, or the recording alone, and only hosted recordings", () => {
    expect(queueFor(a)).toEqual([a]);
    expect(queueFor(b, [a, video, b])).toEqual([a, b]);
    expect(queueFor(video)).toEqual([]);
  });

  it("steps within the queue, continues past its end, wraps on repeat and otherwise ends", () => {
    const queue = [a, b, c];
    const plain = { repeat: false, canContinue: false };
    expect(step(queue, "a", 1, plain)).toEqual({ kind: "play", track: b });
    expect(step(queue, "b", -1, plain)).toEqual({ kind: "play", track: a });
    expect(step(queue, "c", 1, plain)).toEqual({ kind: "end" });
    expect(step(queue, "a", -1, plain)).toEqual({ kind: "end" });
    expect(step(queue, "c", 1, { repeat: true, canContinue: true })).toEqual({ kind: "continue" });
    expect(step(queue, "c", 1, { repeat: true, canContinue: false })).toEqual({
      kind: "play",
      track: a,
    });
    expect(step(queue, "a", -1, { repeat: true, canContinue: true })).toEqual({
      kind: "play",
      track: c,
    });
    expect(step([], undefined, 1, { repeat: true, canContinue: false })).toEqual({ kind: "end" });
  });

  it("builds continuation searches and appends only new playable recordings", () => {
    expect(continuationSearch({ q: "rain", genre: "", cursor: "x", limit: 12 }).toString()).toBe(
      "q=rain&cursor=x&limit=12",
    );
    const page: CatalogPage = { items: [b, video, c], total: 3, nextCursor: "y" };
    expect(extend([a, b], { limit: 12, cursor: "x" }, page)).toEqual({
      incoming: [c],
      queue: [a, b, c],
      continuation: { limit: 12, cursor: "y" },
    });
    expect(extend([a], { limit: 12 }, { ...page, nextCursor: null }).continuation).toBeNull();
  });
});

describe("playback engine", () => {
  it("plays from the visible list and announces loading and playing", async () => {
    const { engine, audio, calls } = setup();
    engine.play(b, [a, video, b]);
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, queue: [a, b], loading: true });
    await flush();
    expect(audio.src).toBe("grant:b");
    expect(audio.paused).toBe(false);
    expect(engine.state.getSnapshot()).toMatchObject({ playing: true, loading: false, error: "" });
    expect(calls.announced).toEqual(["player.loadingStatus", "player.playingStatus"]);
  });

  it("plays a saved recording from its stored copy and releases the copy afterwards", async () => {
    const saved = new Blob(["a"]);
    const { engine, audio, calls, detach } = setup({
      downloaded: (id) => (id === "a" ? saved : undefined),
    });
    engine.play(a, [a, b]);
    await flush();
    expect(audio.src).toBe("blob:1");
    expect(calls.grants).toEqual([]);
    engine.advance(1);
    await flush();
    expect(audio.src).toBe("grant:b");
    expect(calls.revoked).toEqual(["blob:1"]);
    engine.advance(-1);
    await flush();
    detach();
    expect(calls.revoked).toEqual(["blob:1", "blob:2"]);
  });

  it("discards the late source of a superseded start", async () => {
    const slow = deferred<string>();
    const { engine, audio } = setup({
      grant: (id) => (id === "a" ? slow.promise : Promise.resolve(`grant:${id}`)),
    });
    engine.play(a, [a, b]);
    expect(playbackStarting()).toBe(true);
    engine.play(b, [a, b]);
    await flush();
    expect(audio.src).toBe("grant:b");
    slow.resolve("grant:a");
    await flush();
    expect(audio.src).toBe("grant:b");
    expect(engine.state.getSnapshot().current).toBe(b);
  });

  it("reports a blocked autoplay and a failed source with fixed message keys", async () => {
    const failing = setup({ grant: () => Promise.reject(new Error("offline")) });
    failing.engine.play(a);
    await flush();
    expect(failing.engine.state.getSnapshot()).toMatchObject({
      error: "player.playbackError",
      loading: false,
    });
    expect(failing.calls.failed).toBe(1);

    const blocked = setup();
    blocked.audio.refusePlay = true;
    blocked.engine.play(a);
    await flush();
    expect(blocked.engine.state.getSnapshot().error).toBe("player.cannotAutoplay");
    expect(blocked.calls.failed).toBe(0);
  });

  it("moves through the queue and stops at its end", async () => {
    const { engine, audio } = setup();
    engine.play(a, [a, b]);
    await flush();
    audio.emit("ended");
    await flush();
    expect(engine.state.getSnapshot().current).toBe(b);
    engine.advance(1);
    await flush();
    expect(audio.paused).toBe(true);
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, playing: false });
  });

  it("wraps around on repeat", async () => {
    const { engine } = setup();
    engine.play(b, [a, b]);
    engine.toggleRepeat();
    await flush();
    engine.advance(1);
    await flush();
    expect(engine.state.getSnapshot().current).toBe(a);
    engine.advance(-1);
    await flush();
    expect(engine.state.getSnapshot().current).toBe(b);
  });

  it("continues past the queue with the next catalogue page", async () => {
    const next = deferred<CatalogPage>();
    const searches: string[] = [];
    const { engine, calls } = setup({
      catalogPage: (search) => {
        searches.push(search.toString());
        return next.promise;
      },
    });
    engine.play(b, [a, b], { limit: 12, cursor: "x" });
    await flush();
    engine.advance(1);
    // A second skip while the page loads is ignored.
    engine.advance(1);
    expect(searches).toEqual(["limit=12&cursor=x"]);
    next.resolve({ items: [b, c, video], total: 3, nextCursor: null });
    await flush();
    expect(engine.state.getSnapshot()).toMatchObject({ current: c, queue: [a, b, c] });
    expect(calls.registered).toEqual([b, c, video]);
    engine.advance(1);
    await flush();
    expect(engine.state.getSnapshot().current).toBe(c);
    expect(searches).toHaveLength(1);
  });

  it("publishes position ticks without notifying the player state", async () => {
    const { engine, audio } = setup();
    engine.play(a);
    await flush();
    const stateChanges = vi.fn();
    const positions: number[] = [];
    engine.state.subscribe(stateChanges);
    engine.position.subscribe(() => positions.push(engine.position.getSnapshot()));
    for (const time of [1, 2, 3]) {
      audio.currentTime = time;
      audio.emit("timeupdate");
    }
    expect(positions).toEqual([1, 2, 3]);
    expect(stateChanges).not.toHaveBeenCalled();
    engine.seek(40);
    expect(audio.currentTime).toBe(40);
    expect(engine.position.getSnapshot()).toBe(40);
    audio.duration = 212;
    audio.emit("durationchange");
    expect(engine.state.getSnapshot().duration).toBe(212);
    audio.duration = Number.POSITIVE_INFINITY;
    audio.emit("durationchange");
    expect(engine.state.getSnapshot().duration).toBe(212);
  });

  it("refreshes a missing streaming source at the same position when resuming", async () => {
    const { engine, audio, calls } = setup();
    engine.play(a);
    await flush();
    audio.pause();
    audio.removeAttribute("src");
    audio.currentTime = 42;
    await engine.toggle();
    expect(calls.grants).toEqual(["a", "a"]);
    expect(audio.src).toBe("grant:a");
    expect(audio.currentTime).toBe(42);
    expect(audio.paused).toBe(false);
    await engine.toggle();
    expect(audio.paused).toBe(true);
  });

  it("explains an offline resume failure", async () => {
    let online = true;
    const { engine, audio } = setup({ online: () => online });
    engine.play(a);
    await flush();
    audio.pause();
    online = false;
    audio.refusePlay = true;
    await engine.toggle();
    expect(engine.state.getSnapshot().error).toBe("player.refreshFailed");
  });

  it("opens external recordings in their dialog without touching the audio", async () => {
    const { engine, audio, calls } = setup();
    engine.play(video);
    const first = engine.state.getSnapshot().external;
    expect(first?.track).toBe(video);
    expect(audio.getAttribute("src")).toBeNull();
    expect(calls.grants).toEqual([]);
    engine.closeExternal();
    expect(engine.state.getSnapshot().external).toBeNull();
    engine.play(video);
    // Every request is new, so consent to load the embed never carries over.
    expect(engine.state.getSnapshot().external).not.toBe(first);
  });

  it("pauses the other audio before making sound and yields to it", async () => {
    const { engine, audio } = setup();
    const binaural = vi.fn();
    const unregister = engine.registerOtherAudio(binaural);
    engine.play(a);
    await flush();
    expect(binaural).toHaveBeenCalled();
    engine.setTimer(15);
    engine.pauseForOtherAudio();
    expect(audio.paused).toBe(true);
    expect(engine.timer.getSnapshot()).toBeNull();
    unregister();
    binaural.mockClear();
    engine.play(b);
    await flush();
    expect(binaural).not.toHaveBeenCalled();
  });

  it("ends listening when the sleep timer runs out", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let now = 0;
    const { engine, audio, page, calls } = setup({ now: () => now });
    engine.play(a);
    await flush();
    engine.setTimer(5);
    expect(engine.timer.getSnapshot()).toBe(5);
    now = 4.5 * 60000;
    vi.advanceTimersByTime(1000);
    expect(engine.timer.getSnapshot()).toBe(1);
    // A background tab catches up when it becomes visible again.
    now = 5 * 60000;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(engine.timer.getSnapshot()).toBeNull();
    expect(audio.paused).toBe(true);
    expect(calls.announced.at(-1)).toBe("player.timerEnded");
  });

  it("records a consenting listener's sessions with the before and after check-ins", async () => {
    const { engine, calls } = setup({
      userId: () => "u",
      moodConsent: () => true,
      privacy: { owner: "u", consent: true },
    });
    engine.play(a, [a, b]);
    expect(engine.prompts.getSnapshot().before).toEqual({ track: a, queue: [a, b] });
    expect(engine.state.getSnapshot().current).toBeNull();
    engine.chooseScore(3);
    engine.listenAfterCheckIn(true);
    await flush();
    expect(engine.prompts.getSnapshot().before).toBeNull();
    expect(calls.opened).toEqual([{ trackId: "a", beforeScore: 3, owner: "u" }]);
    engine.finish();
    await flush();
    expect(calls.closed).toEqual(["session-1"]);
    expect(engine.prompts.getSnapshot()).toMatchObject({ after: "session-1", score: null });
    engine.dismissAfter();
    expect(engine.prompts.getSnapshot().after).toBeNull();
  });

  it("closes a session opened for a superseded start", async () => {
    const opening = deferred<string>();
    const { engine, calls } = setup({
      userId: () => "u",
      privacy: { owner: "u", consent: true },
      sessionRequests: {
        open: () => opening.promise,
        async close(id) {
          calls.closed.push(id);
        },
      },
    });
    engine.play(a, [a, b]);
    await flush();
    engine.play(b, [a, b]);
    opening.resolve("late");
    await flush();
    expect(calls.closed).toContain("late");
  });

  it("starts the next recording without waiting for the previous session to end", async () => {
    // Ending the old session runs beside the next start, so its request (and its rate limit)
    // stays off the way from the tap to the first sound.
    const closing = deferred<void>();
    const { engine, audio, calls } = setup({
      userId: () => "u",
      privacy: { owner: "u", consent: true },
      sessionRequests: {
        async open(trackId, beforeScore, owner) {
          calls.opened.push({ trackId, beforeScore, owner });
          return `session-${calls.opened.length}`;
        },
        close(id) {
          calls.closed.push(id);
          return closing.promise;
        },
      },
    });
    engine.play(a, [a, b]);
    await flush();
    expect(calls.opened).toHaveLength(1);
    engine.play(b, [a, b]);
    await flush();
    // The first session's end is still pending, yet b already has its source and plays.
    expect(calls.closed).toEqual(["session-1"]);
    expect(calls.grants).toEqual(["a", "b"]);
    expect(audio.src).toBe("grant:b");
    expect(audio.paused).toBe(false);
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, loading: false });
    closing.resolve();
    await flush();
    expect(calls.opened.map((session) => session.trackId)).toEqual(["a", "b"]);
  });

  it("drops listening state for another account and never saves its session", async () => {
    const { engine, calls } = setup({
      userId: () => "u",
      privacy: { owner: "u", consent: true },
    });
    engine.play(a, [a, b]);
    await flush();
    expect(calls.opened).toHaveLength(1);
    engine.setPrivacy({ owner: "v", consent: false });
    expect(engine.state.getSnapshot().queue).toEqual([a]);
    engine.finish();
    await flush();
    expect(calls.closed).toEqual([]);
  });

  it("supersedes a pending start when detached", async () => {
    const slow = deferred<string>();
    const { engine, audio, detach } = setup({ grant: () => slow.promise });
    engine.play(a);
    detach();
    slow.resolve("grant:a");
    await flush();
    expect(audio.getAttribute("src")).toBeNull();
  });

  it("keeps the volume and mute for the visit, including on an element attached later", () => {
    const { engine, audio, detach } = setup();
    engine.setVolume(0.4);
    engine.toggleMute();
    expect([audio.volume, audio.muted]).toEqual([0.4, true]);
    // Raising the slider ends the mute; values outside the range are clamped.
    engine.setVolume(1.7);
    expect([audio.volume, audio.muted]).toEqual([1, false]);
    engine.setVolume(0);
    engine.toggleMute();
    detach();
    const next = new FakeAudio();
    engine.attach(next, new EventTarget())();
    expect([next.volume, next.muted]).toEqual([0, true]);
    expect(engine.state.getSnapshot()).toMatchObject({ volume: 0, muted: true });
  });
});

describe("interrupted play requests", () => {
  it("reports no autoplay error for a start the listener skipped while it buffered", async () => {
    const { engine, audio } = setup();
    audio.buffering = true;
    engine.play(a, [a, b]);
    await flush();
    engine.advance(1);
    await flush();
    audio.ready();
    await flush();
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, playing: true, error: "" });
  });

  it("treats a pause while buffering as a pause, not an autoplay failure", async () => {
    const { engine, audio } = setup();
    audio.buffering = true;
    engine.play(a);
    await flush();
    // A pause the engine did not ask for, such as an operating system control.
    audio.pause();
    await flush();
    expect(engine.state.getSnapshot()).toMatchObject({ playing: false, error: "" });
  });

  it("reports no autoplay error for a Media Session resume interrupted by a newer start", async () => {
    const { engine, audio } = setup();
    engine.play(a, [a, b]);
    await flush();
    audio.pause();
    audio.buffering = true;
    engine.transport.play();
    engine.play(b, [a, b]);
    await flush();
    audio.ready();
    await flush();
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, playing: true, error: "" });
  });
});

describe("resuming", () => {
  it("ignores a late resume source after the listener chose another recording", async () => {
    const late = deferred<string>();
    let resumes = 0;
    const saved = new Blob(["b"]);
    const { engine, audio } = setup({
      downloaded: (id) => (id === "b" ? saved : undefined),
      grant: (id) => (id === "a" && resumes++ > 0 ? late.promise : Promise.resolve(`grant:${id}`)),
    });
    engine.play(a, [a, b]);
    await flush();
    audio.currentTime = 42;
    audio.pause();
    audio.error = { code: 2 };
    const retry = engine.toggle();
    engine.play(b, [a, b]);
    await flush();
    expect(audio.src).toBe("blob:1");
    late.resolve("grant:a:late");
    await retry;
    await flush();
    expect(audio.src).toBe("blob:1");
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, playing: true, error: "" });
  });

  it("ignores a late resume source after the binaural session took over", async () => {
    const late = deferred<string>();
    let grants = 0;
    const { engine, audio } = setup({
      grant: (id) => (grants++ > 0 ? late.promise : Promise.resolve(`grant:${id}`)),
    });
    engine.play(a);
    await flush();
    audio.pause();
    audio.removeAttribute("src");
    const resume = engine.toggle();
    engine.pauseForOtherAudio();
    late.resolve("grant:a:late");
    await resume;
    await flush();
    expect(audio.paused).toBe(true);
    expect(audio.getAttribute("src")).toBeNull();
  });

  it("Retry requests a fresh source for a streamed recording that failed after a saved one", async () => {
    const saved = new Blob(["a"]);
    let failures = 1;
    const { engine, audio, calls } = setup({
      downloaded: (id) => (id === "a" ? saved : undefined),
      async grant(id) {
        calls.grants.push(id);
        if (id === "b" && failures-- > 0) throw new Error("unavailable");
        return `grant:${id}`;
      },
    });
    engine.play(a, [a, b]);
    await flush();
    engine.play(b, [a, b]);
    await flush();
    expect(engine.state.getSnapshot().error).toBe("player.playbackError");
    // The saved recording's object URL is released as soon as the element lets go of it.
    expect(calls.revoked).toEqual(["blob:1"]);
    await engine.toggle();
    expect(calls.grants).toEqual(["b", "b"]);
    expect(audio.src).toBe("grant:b");
    expect(engine.state.getSnapshot()).toMatchObject({ current: b, playing: true, error: "" });
  });
});

describe("pending work after listening stops", () => {
  it("Finish while a recording loads keeps it from starting or recording a session", async () => {
    const gate = deferred<string>();
    const { engine, audio, calls } = setup({
      grant: () => gate.promise,
      userId: () => "u",
      privacy: { owner: "u", consent: true },
    });
    engine.play(a, [a, b]);
    expect(engine.state.getSnapshot().loading).toBe(true);
    engine.finish();
    expect(engine.state.getSnapshot().loading).toBe(false);
    gate.resolve("grant:a");
    await flush();
    expect(audio.paused).toBe(true);
    expect(audio.getAttribute("src")).toBeNull();
    expect(calls.opened).toEqual([]);
  });

  it("opening an external recording keeps a loading recording from starting behind it", async () => {
    const gate = deferred<string>();
    const { engine, audio } = setup({ grant: () => gate.promise });
    engine.play(a);
    engine.play(video);
    gate.resolve("grant:a");
    await flush();
    expect(audio.paused).toBe(true);
    expect(engine.state.getSnapshot()).toMatchObject({
      loading: false,
      external: { track: video },
    });
  });

  it("a Media Session pause while a recording loads keeps it from starting", async () => {
    const gate = deferred<string>();
    const { engine, audio } = setup({ grant: () => gate.promise });
    engine.play(a);
    engine.transport.pause();
    gate.resolve("grant:a");
    await flush();
    expect(audio.paused).toBe(true);
    expect(engine.state.getSnapshot().loading).toBe(false);
  });

  it("an expired sleep timer keeps a loading recording or catalogue page from starting", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let now = 0;
    const gate = deferred<string>();
    const page = deferred<CatalogPage>();
    const { engine, audio } = setup({
      now: () => now,
      grant: (id) => (id === "c" ? gate.promise : Promise.resolve(`grant:${id}`)),
      catalogPage: () => page.promise,
    });
    engine.play(b, [a, b], { limit: 12, cursor: "x" });
    await flush();
    engine.setTimer(1);
    engine.advance(1);
    now = 60000;
    vi.advanceTimersByTime(1000);
    expect(engine.timer.getSnapshot()).toBeNull();
    page.resolve({ items: [c], total: 3, nextCursor: null });
    gate.resolve("grant:c");
    await flush();
    expect(audio.paused).toBe(true);
    expect(engine.state.getSnapshot().current).toBe(b);

    engine.play(c, [c]);
    engine.setTimer(1);
    now = 2 * 60000;
    vi.advanceTimersByTime(1000);
    await flush();
    expect(audio.paused).toBe(true);
    expect(audio.getAttribute("src")).toBeNull();
  });
});

describe("browsing resets during a pending catalogue page", () => {
  function pagedSetup() {
    let page = deferred<CatalogPage>();
    const searches: string[] = [];
    const harness = setup({
      catalogPage: (search) => {
        searches.push(search.toString());
        return page.promise;
      },
      userId: () => "u",
      privacy: { owner: "u", consent: false },
    });
    return {
      ...harness,
      searches,
      page: () => page,
      nextPage: () => (page = deferred<CatalogPage>()),
    };
  }

  it("Next fetches again after Finish superseded a page", async () => {
    const { engine, searches, page, nextPage } = pagedSetup();
    engine.play(b, [a, b], { limit: 12, cursor: "x" });
    await flush();
    engine.advance(1);
    engine.finish();
    page().resolve({ items: [c], total: 3, nextCursor: null });
    await flush();
    expect(engine.state.getSnapshot().current).toBe(b);
    const second = nextPage();
    engine.advance(1);
    expect(searches).toHaveLength(2);
    second.resolve({ items: [c], total: 3, nextCursor: null });
    await flush();
    expect(engine.state.getSnapshot().current).toBe(c);
  });

  it("Next still ends listening after an account change superseded a page", async () => {
    const { engine, audio, page } = pagedSetup();
    engine.play(b, [a, b], { limit: 12, cursor: "x" });
    await flush();
    engine.advance(1);
    engine.setPrivacy({ owner: "v", consent: false });
    page().resolve({ items: [c], total: 3, nextCursor: null });
    await flush();
    expect(audio.paused).toBe(false);
    engine.advance(1);
    expect(audio.paused).toBe(true);
  });

  it("a late page never replaces a recording tapped meanwhile, and auto-advance still works", async () => {
    const { engine, audio, page } = pagedSetup();
    engine.play(b, [a, b], { limit: 12, cursor: "x" });
    await flush();
    engine.advance(1);
    engine.play(a, [a, b]);
    page().resolve({ items: [c], total: 3, nextCursor: null });
    await flush();
    expect(engine.state.getSnapshot().current).toBe(a);
    audio.emit("ended");
    await flush();
    expect(engine.state.getSnapshot().current).toBe(b);
  });
});

describe("listening sessions", () => {
  it("offers the after check-in only to the account and consent that ended the session", async () => {
    const feedback = vi.fn();
    const failed = vi.fn();
    const close = deferred<void>();
    const sessions = createListeningSessions({
      requests: { open: async () => "s", close: () => close.promise },
      initial: { owner: "u", consent: true },
      online: () => true,
      onFeedback: feedback,
      onSaveFailed: failed,
    });
    await sessions.open("a", undefined, "u", () => true);
    const ending = sessions.end();
    expect(sessions.update({ owner: "u", consent: false })).toEqual({
      reset: true,
      accountChanged: false,
    });
    close.resolve();
    await ending;
    expect(feedback).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(sessions.update({ owner: null, consent: false })).toEqual({
      reset: true,
      accountChanged: true,
    });
  });
});

describe("sleep timer", () => {
  it("turns off with 0 and rounds the remaining time up to whole minutes", () => {
    let now = 0;
    const expired = vi.fn();
    const timer = createSleepTimer({ onExpire: expired, now: () => now });
    timer.set(15);
    now = 60001;
    timer.tick();
    expect(timer.minutes.getSnapshot()).toBe(14);
    timer.set(0);
    expect(timer.minutes.getSnapshot()).toBeNull();
    now = 10 * 60 * 60000;
    timer.tick();
    expect(expired).not.toHaveBeenCalled();
  });

  it("reads the wall clock on every tick", () => {
    const expired = vi.fn();
    const timer = createSleepTimer({ onExpire: expired });
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      timer.set(5);
      clock.mockReturnValue(5 * 60000);
      timer.tick();
      expect(expired).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
    }
  });
});

describe("audio focus", () => {
  it("keeps one registration and only its own cleanup removes it", () => {
    const focus = createAudioFocus();
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = focus.register(first);
    focus.register(second);
    removeFirst();
    focus.pauseOther();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe("media session", () => {
  let handlers: Map<string, MediaSessionActionHandler | null>;
  let session: MediaSession;
  beforeEach(() => {
    handlers = new Map();
    session = {
      setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
        if (action === "seekto") throw new TypeError("unsupported");
        handlers.set(action, handler);
      },
    } as MediaSession;
  });

  it("installs the transport handlers the device supports and removes them again", () => {
    const controls = {
      play: vi.fn(),
      pause: vi.fn(),
      previous: vi.fn(),
      next: vi.fn(),
      seekTo: vi.fn(),
      seekBy: vi.fn(),
    };
    const remove = setMediaActions(session, transportActions(controls));
    expect([...handlers.keys()]).toEqual([
      "play",
      "pause",
      "previoustrack",
      "nexttrack",
      "seekbackward",
      "seekforward",
    ]);
    handlers.get("seekbackward")!({ action: "seekbackward" });
    handlers.get("seekforward")!({ action: "seekforward", seekOffset: 30 });
    handlers.get("nexttrack")!({ action: "nexttrack" });
    expect(controls.seekBy.mock.calls).toEqual([[-10], [30]]);
    expect(controls.next).toHaveBeenCalledOnce();
    remove();
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
  });

  it("clamps relative seeks to the recording", async () => {
    const { engine, audio } = setup();
    engine.play(a);
    await flush();
    audio.duration = 100;
    audio.currentTime = 95;
    engine.transport.seekBy(10);
    expect(audio.currentTime).toBe(100);
    audio.currentTime = 4;
    engine.transport.seekBy(-10);
    expect(audio.currentTime).toBe(0);
  });
});
