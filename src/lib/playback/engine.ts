import type { CatalogPage, CatalogQuery, Track } from "@/lib/types";
import { createStore, type ReadableStore } from "@/lib/state/create-store";
import { createAudioFocus } from "./audio-focus";
import type { TransportControls } from "./media-session";
import { continuationSearch, extend, isPlayable, queueFor, step } from "./queue";
import { createListeningSessions, type Privacy, type SessionRequests } from "./session-machine";
import { createSleepTimer } from "./sleep-timer";

// The catalogue player without React: one native <audio> element, the queue, listening
// sessions, the sleep timer and the hand-off with the binaural session. The React provider
// creates one engine per instance (never a module singleton, because client modules also run
// during server rendering), attaches the element and renders the stores below.

/** The part of HTMLAudioElement the engine drives; unit tests pass a fake. */
export interface AudioOutput extends EventTarget {
  readonly paused: boolean;
  currentTime: number;
  readonly duration: number;
  readonly error: unknown;
  src: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
}

/** Message keys under player.* shown in the player's alert. */
export type PlayerError =
  "" | "player.playbackError" | "player.cannotAutoplay" | "player.refreshFailed";

/** Message keys under player.* announced to assistive technology. */
export type PlayerAnnouncement =
  | "player.loadingStatus"
  | "player.playingStatus"
  | "player.sessionSaveFailed"
  | "player.timerEnded";

/** An external recording whose dialog is open; a new object for every request. */
export type ExternalRequest = Readonly<{ track: Track }>;

export type PlayerState = Readonly<{
  current: Track | null;
  queue: readonly Track[];
  playing: boolean;
  loading: boolean;
  /** Seconds; the catalogue duration until the media reports its own. */
  duration: number;
  repeat: boolean;
  error: PlayerError;
  /** Set while the binaural page owns the screen and the player bar stays out of the way. */
  controlsHidden: boolean;
  external: ExternalRequest | null;
}>;

/** A start waiting for the optional mood check-in before listening. */
export type PendingStart = Readonly<{ track: Track; queue: readonly Track[] }>;

export type MoodPrompts = Readonly<{
  before: PendingStart | null;
  /** The ended session waiting for the optional check-in after listening. */
  after: string | null;
  /** The score chosen in whichever check-in is open. */
  score: number | null;
}>;

export type PlaybackDeps = {
  /** The saved copy of a recording, if it was downloaded. */
  downloaded(id: string): Blob | undefined;
  /** A short-lived URL that streams a hosted recording. */
  grant(id: string): Promise<string>;
  catalogPage(search: URLSearchParams, signal: AbortSignal): Promise<CatalogPage>;
  registerTracks(tracks: Track[]): void;
  sessionRequests: SessionRequests;
  /** The signed-in account, or null for a guest. */
  userId(): string | null;
  /** Whether the signed-in listener consented to mood check-ins. */
  moodConsent(): boolean;
  online(): boolean;
  announce(key: PlayerAnnouncement, track?: Track): void;
  /** Reports a failed start to monitoring (a fixed category, never details). */
  failed(): void;
  /** The audio-first contract (src/lib/perf/audio-first.ts). */
  beginPlaybackStart(): () => void;
  objectUrl: { create(blob: Blob): string; revoke(url: string): void };
  /** The account and consent at creation. */
  privacy: Privacy;
  now?: () => number;
};

const initialState: PlayerState = {
  current: null,
  queue: [],
  playing: false,
  loading: false,
  duration: 0,
  repeat: false,
  error: "",
  controlsHidden: false,
  external: null,
};

export function createPlaybackEngine(deps: PlaybackDeps) {
  const state = createStore<PlayerState>(initialState);
  // Position ticks several times a second, so it has its own store: only the seek row renders.
  const position = createStore(0);
  const prompts = createStore<MoodPrompts>({ before: null, after: null, score: null });
  const focus = createAudioFocus();
  const patch = (next: Partial<PlayerState>) =>
    state.set((current) =>
      (Object.keys(next) as (keyof PlayerState)[]).every((key) =>
        Object.is(current[key], next[key]),
      )
        ? current
        : { ...current, ...next },
    );

  let audio: AudioOutput | null = null;
  // Playback generation: a newer start, a pause for other audio, an account change or unmount
  // supersedes a start that is still waiting for its source.
  let epoch = 0;
  // Browsing generation: supersedes catalogue continuation requests.
  let browsing = 0;
  let advancing = false;
  let browseAbort: AbortController | null = null;
  let continuation: CatalogQuery | null = null;
  let blobUrl: string | null = null;

  const sessions = createListeningSessions({
    requests: deps.sessionRequests,
    initial: deps.privacy,
    online: deps.online,
    onFeedback: (id) => prompts.set((current) => ({ ...current, after: id, score: null })),
    onSaveFailed: () => deps.announce("player.sessionSaveFailed"),
  });
  const timer = createSleepTimer({
    now: deps.now,
    onExpire() {
      supersede();
      audio?.pause();
      deps.announce("player.timerEnded");
      void sessions.end();
    },
  });

  function stopBrowsing() {
    browsing++;
    browseAbort?.abort();
    advancing = false;
  }

  /**
   * Stops pending work on every path that stops listening: a start still waiting for its source
   * returns without playing (a session opened for it closes itself), and a catalogue page still
   * loading never starts the next recording.
   */
  function supersede() {
    epoch++;
    stopBrowsing();
    patch({ loading: false });
  }

  async function start(track: Track, queue: readonly Track[], beforeScore?: number) {
    focus.pauseOther();
    if (!isPlayable(track)) {
      supersede();
      audio?.pause();
      patch({ external: { track } });
      return;
    }
    const version = ++epoch;
    const element = audio;
    if (!element) return;
    const online = deps.online();
    // Decoration (the garden scene, GSAP reveals) waits until this start plays or fails.
    const settle = deps.beginPlaybackStart();
    // End the previous session concurrently: the id is taken synchronously, so saving it never
    // races the new session and never delays the source.
    void sessions.end();
    element.pause();
    element.removeAttribute("src");
    element.load();
    // The element has let go of a saved recording's object URL: release it now, so a start that
    // fails never leaves it behind (resuming refreshes a stream only when there is none).
    if (blobUrl) deps.objectUrl.revoke(blobUrl);
    blobUrl = null;
    position.set(0);
    patch({ error: "", loading: true, duration: track.duration, current: track, queue });
    deps.announce("player.loadingStatus", track);
    try {
      const saved = deps.downloaded(track.id);
      const source = saved ? deps.objectUrl.create(saved) : await deps.grant(track.id);
      if (version !== epoch) {
        if (saved) deps.objectUrl.revoke(source);
        return;
      }
      blobUrl = saved ? source : null;
      element.src = source;
      element.load();
      try {
        await element.play();
      } catch {
        patch({ error: "player.cannotAutoplay" });
      }
      settle();
      const owner = deps.userId();
      if (version === epoch && owner && sessions.mayRecord(owner) && online)
        await sessions.open(track.id, beforeScore, owner, () => version === epoch);
    } catch {
      if (version === epoch) {
        patch({ error: "player.playbackError" });
        deps.failed();
      }
    } finally {
      settle();
      if (version === epoch) patch({ loading: false });
    }
  }

  /** Plays `track` from the list the listener sees, after the optional mood check-in. */
  function play(track: Track, visible?: readonly Track[], query?: CatalogQuery) {
    focus.pauseOther();
    stopBrowsing();
    continuation = query || null;
    const queue = queueFor(track, visible);
    if (isPlayable(track) && deps.userId() && deps.moodConsent() && deps.online())
      prompts.set((current) => ({ ...current, before: { track, queue }, score: null }));
    else void start(track, queue);
  }

  /** Skips by `offset` within the queue, fetching the next catalogue page past its end. */
  function advance(offset: number) {
    if (offset > 0 && advancing) return;
    browseAbort?.abort();
    advancing = false;
    const version = ++browsing;
    const { queue, current, repeat } = state.getSnapshot();
    const next = step(queue, current?.id, offset, { repeat, canContinue: continuation !== null });
    if (next.kind === "play") {
      void start(next.track, queue);
      return;
    }
    if (next.kind === "end" || !continuation) {
      audio?.pause();
      void sessions.end();
      return;
    }
    const query = continuation;
    const controller = new AbortController();
    browseAbort = controller;
    advancing = true;
    void deps
      .catalogPage(continuationSearch(query), controller.signal)
      .then((page) => {
        if (version !== browsing) return;
        const extended = extend(queue, query, page);
        continuation = extended.continuation;
        deps.registerTracks(page.items);
        if (extended.incoming.length) void start(extended.incoming[0], extended.queue);
        else {
          audio?.pause();
          void sessions.end();
        }
      })
      .catch(() => {
        if (version === browsing) patch({ error: "player.playbackError" });
      })
      .finally(() => {
        if (version === browsing) advancing = false;
      });
  }

  /** Play or pause; resuming refreshes an expired or failed streaming source first. */
  async function toggle() {
    const element = audio;
    const track = state.getSnapshot().current;
    if (!element || !track) return;
    focus.pauseOther();
    if (!element.paused) {
      element.pause();
      return;
    }
    // A newer start, Finish or the binaural session supersedes this resume, including a source
    // that is still on its way.
    const version = epoch;
    const current = () => version === epoch && audio === element;
    const online = deps.online();
    try {
      if ((!element.getAttribute("src") || element.error) && online && !blobUrl) {
        const at = element.currentTime;
        const source = await deps.grant(track.id);
        if (!current()) return;
        element.src = source;
        element.currentTime = at;
      }
      await element.play();
      if (current()) patch({ error: "" });
    } catch {
      if (current()) patch({ error: online ? "player.playbackError" : "player.refreshFailed" });
    }
  }

  function resume() {
    focus.pauseOther();
    void audio?.play().catch(() => patch({ error: "player.cannotAutoplay" }));
  }

  function seekTo(seconds: number) {
    if (audio) audio.currentTime = seconds;
  }

  const transport: TransportControls = {
    play: resume,
    pause() {
      supersede();
      audio?.pause();
    },
    previous: () => advance(-1),
    next: () => advance(1),
    seekTo,
    seekBy(seconds) {
      if (!audio) return;
      audio.currentTime =
        seconds < 0
          ? Math.max(0, audio.currentTime + seconds)
          : Math.min(audio.duration || 0, audio.currentTime + seconds);
    },
  };

  return {
    state: state as ReadableStore<PlayerState>,
    position: position as ReadableStore<number>,
    prompts: prompts as ReadableStore<MoodPrompts>,
    /** Whole minutes left on the sleep timer, or null. */
    timer: timer.minutes,
    transport,
    play,
    start,
    advance,
    toggle,

    /**
     * Drives `element` and runs the sleep timer until the returned cleanup, which also
     * supersedes a pending start and releases a downloaded recording's object URL.
     */
    attach(element: AudioOutput, page: EventTarget = document) {
      audio = element;
      const listeners: [string, () => void][] = [
        [
          "play",
          () => {
            patch({ playing: true });
            const current = state.getSnapshot().current;
            if (current) deps.announce("player.playingStatus", current);
          },
        ],
        ["pause", () => patch({ playing: false })],
        ["timeupdate", () => position.set(element.currentTime)],
        [
          "durationchange",
          () => {
            if (Number.isFinite(element.duration)) patch({ duration: element.duration });
          },
        ],
        ["ended", () => advance(1)],
        ["error", () => patch({ error: "player.playbackError" })],
      ];
      for (const [type, listener] of listeners) element.addEventListener(type, listener);
      const interval = setInterval(timer.tick, 1000);
      page.addEventListener("visibilitychange", timer.tick);
      return () => {
        for (const [type, listener] of listeners) element.removeEventListener(type, listener);
        clearInterval(interval);
        page.removeEventListener("visibilitychange", timer.tick);
        epoch++;
        if (blobUrl) deps.objectUrl.revoke(blobUrl);
        blobUrl = null;
        if (audio === element) audio = null;
      };
    },

    /** Applies the current account and consent; another account drops its listening state. */
    setPrivacy(next: Privacy) {
      const { reset, accountChanged } = sessions.update(next);
      if (!reset) return;
      supersede();
      continuation = null;
      sessions.forget();
      prompts.set({ before: null, after: null, score: null });
      const current = state.getSnapshot().current;
      if (accountChanged) patch({ queue: current ? [current] : [] });
    },

    /** The slider: moves the media and shows the new position at once. */
    seek(seconds: number) {
      seekTo(seconds);
      position.set(seconds);
    },
    /** Finish: stops listening and ends the session. */
    finish() {
      supersede();
      audio?.pause();
      void sessions.end();
    },
    toggleRepeat() {
      patch({ repeat: !state.getSnapshot().repeat });
    },
    setTimer: timer.set,

    /** Called by the binaural session before it starts: stop and forget pending work. */
    pauseForOtherAudio() {
      supersede();
      audio?.pause();
      timer.clear();
      prompts.set((current) => ({ ...current, before: null, after: null }));
      patch({ external: null });
      void sessions.end(false);
    },
    registerOtherAudio: focus.register,
    setControlsHidden(hidden: boolean) {
      patch({ controlsHidden: hidden });
    },

    chooseScore(score: number) {
      prompts.set((current) => ({ ...current, score }));
    },
    /** Starts the pending recording, with the chosen before score or skipping the check-in. */
    listenAfterCheckIn(withScore: boolean) {
      const { before, score } = prompts.getSnapshot();
      if (before && (!withScore || score))
        void start(before.track, before.queue, withScore ? (score ?? undefined) : undefined);
      prompts.set((current) => ({ ...current, before: null }));
    },
    dismissBefore() {
      prompts.set((current) => ({ ...current, before: null }));
    },
    dismissAfter() {
      prompts.set((current) => ({ ...current, after: null }));
    },
    closeExternal() {
      patch({ external: null });
    },
  };
}

export type PlaybackEngine = ReturnType<typeof createPlaybackEngine>;
