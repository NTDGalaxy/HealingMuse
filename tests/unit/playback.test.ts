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

/** A media element that plays instantly; `refusePlay` simulates an autoplay block. */
class FakeAudio extends EventTarget implements AudioOutput {
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  error: unknown = null;
  refusePlay = false;
  private source: string | null = null;
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
  load() {}
  async play() {
    if (this.refusePlay) throw new DOMException("blocked", "NotAllowedError");
    if (!this.paused) return;
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
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

/** Lets every pending promise chain settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

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
