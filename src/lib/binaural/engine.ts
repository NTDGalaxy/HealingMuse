import { defaultConfig, frequencies, validateConfig, type BinauralConfig } from "./config";

export type BinauralStatus =
  | "idle"
  | "starting"
  | "playing"
  | "pausing"
  | "paused"
  | "interrupted"
  | "stopping"
  | "completed"
  | "unsupported"
  | "error";
export interface BinauralSnapshot {
  status: BinauralStatus;
  config: BinauralConfig;
  elapsedSeconds: number;
  remainingSeconds: number;
  backgroundError: boolean;
}
type Graph = ReturnType<typeof createBinauralGraph>;

// Explicit mono inputs to a two-channel merger keep each oscillator in its own ear.
// The gain bounds leave at least 25% digital headroom even with full-scale music.
export function createBinauralGraph(context: BaseAudioContext, config: BinauralConfig) {
  const hz = frequencies(config);
  const left = context.createOscillator(),
    right = context.createOscillator();
  const merger = context.createChannelMerger(2);
  merger.channelCount = 1;
  merger.channelCountMode = "explicit";
  merger.channelInterpretation = "discrete";
  left.type = right.type = "sine";
  left.frequency.value = hz.left;
  right.frequency.value = hz.right;
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  const tone = context.createGain(),
    music = context.createGain(),
    master = context.createGain();
  tone.gain.value = config.toneVolume * 0.25;
  music.gain.value = config.backgroundVolume * 0.5;
  master.gain.value = 0;
  merger.connect(tone);
  tone.connect(master);
  music.connect(master);
  master.connect(context.destination);
  return { left, right, merger, tone, music, master };
}
const hold = (param: AudioParam, time: number) => {
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
};
const ramp = (param: AudioParam, value: number, time: number, seconds = 0.1) => {
  hold(param, time);
  param.linearRampToValueAtTime(value, time + seconds);
};
interface Runtime {
  context: AudioContext;
  graph: Graph;
  audio: HTMLAudioElement | null;
  source: MediaElementAudioSourceNode | null;
}
export class BinauralEngine {
  private runtime: Runtime | null = null;
  private listeners = new Set<() => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private transition: ReturnType<typeof setTimeout> | null = null;
  private operation = 0;
  private startedAt = 0;
  private elapsed = 0;
  private backgroundUrl: string | null = null;
  private snapshot: BinauralSnapshot;
  constructor(private factory: () => AudioContext = () => new AudioContext()) {
    this.snapshot = {
      status: "idle",
      config: { ...defaultConfig },
      elapsedSeconds: 0,
      remainingSeconds: defaultConfig.durationSeconds,
      backgroundError: false,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<BinauralSnapshot> = {}) {
    const elapsed = Math.min(
      this.snapshot.config.durationSeconds,
      this.elapsed +
        (this.snapshot.status === "playing" && this.runtime
          ? Math.max(0, this.runtime.context.currentTime - this.startedAt)
          : 0),
    );
    this.snapshot = {
      ...this.snapshot,
      elapsedSeconds: elapsed,
      remainingSeconds: Math.max(0, this.snapshot.config.durationSeconds - elapsed),
      ...patch,
    };
    for (const listener of this.listeners) listener();
  }
  private clearTimers() {
    if (this.tick !== null) clearInterval(this.tick);
    if (this.transition !== null) clearTimeout(this.transition);
    this.tick = this.transition = null;
  }
  configure(config: BinauralConfig) {
    const next = validateConfig(config);
    this.publish({ config: next });
    const runtime = this.runtime;
    if (!runtime) {
      this.publish();
      return;
    }
    const now = runtime.context.currentTime,
      hz = frequencies(next);
    ramp(runtime.graph.left.frequency, hz.left, now);
    ramp(runtime.graph.right.frequency, hz.right, now);
    ramp(runtime.graph.tone.gain, next.toneVolume * 0.25, now);
    ramp(runtime.graph.music.gain, next.backgroundVolume * 0.5, now);
    if (this.snapshot.status === "playing") this.scheduleEnd();
    this.publish();
  }
  prepareBackground(url: string | null) {
    if (url === this.backgroundUrl) return;
    if (this.snapshot.status === "playing" || this.snapshot.status === "starting") this.pause();
    this.backgroundUrl = url;
    this.publish({ backgroundError: false });
  }
  private playBackground(runtime: Runtime): Promise<void> {
    if (!this.backgroundUrl) {
      runtime.audio?.pause();
      if (runtime.audio) {
        runtime.audio.removeAttribute("src");
        runtime.audio.load();
      }
      return Promise.resolve();
    }
    try {
      if (!runtime.audio) {
        runtime.audio = new Audio();
        runtime.audio.crossOrigin = "anonymous";
        runtime.audio.preload = "none";
        runtime.audio.loop = true;
        runtime.audio.src = this.backgroundUrl;
        runtime.source = runtime.context.createMediaElementSource(runtime.audio);
        runtime.source.connect(runtime.graph.music);
        runtime.audio.onerror = () => {
          if (this.runtime === runtime && this.backgroundUrl)
            this.publish({ backgroundError: true });
        };
        runtime.audio.onpause = () => {
          if (this.runtime === runtime && this.snapshot.status === "playing")
            this.pause("interrupted");
        };
      }
      if (runtime.audio.getAttribute("src") !== this.backgroundUrl) {
        runtime.audio.src = this.backgroundUrl;
        runtime.audio.load();
      }
      return runtime.audio.play().then(
        () => {
          if (this.runtime === runtime) this.publish({ backgroundError: false });
        },
        () => {
          if (this.runtime === runtime) this.publish({ backgroundError: true });
        },
      );
    } catch {
      this.publish({ backgroundError: true });
      return Promise.resolve();
    }
  }
  private scheduleEnd() {
    const runtime = this.runtime;
    if (!runtime) return;
    const now = runtime.context.currentTime;
    const remaining = this.snapshot.config.durationSeconds - (this.elapsed + now - this.startedAt);
    if (remaining <= 0) {
      this.complete(runtime);
      return;
    }
    const end = now + remaining,
      fadeIn = Math.min(0.8, remaining / 2),
      fadeOut = Math.min(3, remaining / 2);
    const gain = runtime.graph.master.gain;
    hold(gain, now);
    gain.linearRampToValueAtTime(this.snapshot.config.masterVolume, now + fadeIn);
    gain.setValueAtTime(this.snapshot.config.masterVolume, Math.max(now + fadeIn, end - fadeOut));
    gain.linearRampToValueAtTime(0, end);
    runtime.graph.left.stop(end);
    runtime.graph.right.stop(end);
  }
  start = async () => {
    if (["starting", "playing", "pausing", "stopping"].includes(this.snapshot.status)) return;
    const operation = ++this.operation;
    this.clearTimers();
    if (this.runtime?.context.state === "closed") {
      this.destroy(this.runtime);
      this.runtime = null;
    }
    if (!this.runtime) {
      let created: AudioContext | null = null;
      try {
        const context = this.factory();
        created = context;
        if (context.destination.maxChannelCount < 2) {
          void context.close();
          this.publish({ status: "unsupported" });
          return;
        }
        context.destination.channelCount = 2;
        const graph = createBinauralGraph(context, this.snapshot.config);
        const runtime: Runtime = { context, graph, audio: null, source: null };
        this.runtime = runtime;
        if (!["paused", "interrupted"].includes(this.snapshot.status)) this.elapsed = 0;
        graph.left.onended = () => {
          if (this.runtime === runtime && this.snapshot.status !== "stopping")
            this.complete(runtime);
        };
        graph.left.start();
        graph.right.start();
        context.onstatechange = () => {
          if (
            this.runtime === runtime &&
            this.snapshot.status === "playing" &&
            context.state !== "running"
          )
            this.pause("interrupted");
        };
      } catch {
        if (created && !this.runtime) void created.close().catch(() => {});
        this.publish({ status: "unsupported" });
        this.dispose();
        return;
      }
    }
    const runtime = this.runtime;
    hold(runtime.graph.master.gain, runtime.context.currentTime);
    runtime.graph.master.gain.setValueAtTime(0, runtime.context.currentTime);
    this.publish({ status: "starting" });
    try {
      // Both calls occur in the original click stack, including on mobile Safari.
      const resume = runtime.context.resume();
      const music = this.playBackground(runtime);
      await resume;
      if (operation !== this.operation || this.runtime !== runtime) return;
      if (runtime.context.state !== "running") {
        this.pause("interrupted");
        return;
      }
      this.startedAt = runtime.context.currentTime;
      this.publish({ status: "playing" });
      this.scheduleEnd();
      this.tick = setInterval(() => this.publish(), 500);
      void music;
    } catch {
      if (operation === this.operation) this.pause("interrupted");
    }
  };
  pause = (status: "paused" | "interrupted" = "paused") => {
    if (!this.runtime || !["playing", "starting"].includes(this.snapshot.status)) return;
    const runtime = this.runtime,
      operation = ++this.operation;
    this.elapsed = Math.min(
      this.snapshot.config.durationSeconds,
      this.elapsed +
        (this.snapshot.status === "playing"
          ? Math.max(0, runtime.context.currentTime - this.startedAt)
          : 0),
    );
    this.clearTimers();
    ramp(runtime.graph.master.gain, 0, runtime.context.currentTime, 0.08);
    this.publish({
      status: "pausing",
      elapsedSeconds: this.elapsed,
      remainingSeconds: Math.max(0, this.snapshot.config.durationSeconds - this.elapsed),
    });
    this.transition = setTimeout(() => {
      if (operation === this.operation && this.runtime === runtime) {
        this.publish({ status });
        runtime.audio?.pause();
        void runtime.context.suspend().catch(() => {});
      }
    }, 90);
  };
  private destroy(runtime: Runtime) {
    runtime.context.onstatechange = null;
    runtime.graph.left.onended = null;
    runtime.audio?.pause();
    if (runtime.audio) {
      runtime.audio.onerror = null;
      runtime.audio.onpause = null;
      runtime.audio.removeAttribute("src");
      runtime.audio.load();
    }
    for (const oscillator of [runtime.graph.left, runtime.graph.right]) {
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
    }
    for (const node of [...Object.values(runtime.graph), runtime.source]) node?.disconnect();
    void runtime.context.close().catch(() => {});
  }
  private complete(runtime: Runtime) {
    if (this.runtime !== runtime) return;
    ++this.operation;
    this.clearTimers();
    this.runtime = null;
    this.elapsed = this.snapshot.config.durationSeconds;
    this.destroy(runtime);
    this.publish({ status: "completed" });
  }
  stop = () => {
    const runtime = this.runtime;
    ++this.operation;
    this.clearTimers();
    if (!runtime) {
      this.elapsed = 0;
      this.publish({ status: "idle" });
      return;
    }
    this.publish({ status: "stopping" });
    ramp(runtime.graph.master.gain, 0, runtime.context.currentTime, 0.08);
    runtime.audio?.pause();
    this.transition = setTimeout(() => {
      if (this.runtime !== runtime) return;
      this.runtime = null;
      this.destroy(runtime);
      this.elapsed = 0;
      this.publish({ status: "idle" });
    }, 90);
  };
  dispose() {
    ++this.operation;
    this.clearTimers();
    if (this.runtime) this.destroy(this.runtime);
    this.runtime = null;
  }
}
