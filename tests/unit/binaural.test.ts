import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BinauralEngine, createBinauralGraph } from "@/lib/binaural/engine";
import {
  defaultConfig,
  frequencies,
  modes,
  parsePreferences,
  validateConfig,
} from "@/lib/binaural/config";

class Parameter {
  value = 0;
  cancelAndHoldAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}
class Node {
  frequency = new Parameter();
  gain = new Parameter();
  type = "";
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  currentTime = 0;
  state = "suspended";
  destination = { maxChannelCount: 2, channelCount: 2 };
  onstatechange: (() => void) | null = null;
  oscillators: Node[] = [];
  gains: Node[] = [];
  merger = new Node();
  createChannelMerger = vi.fn(() => this.merger);
  createGain = () => {
    const node = new Node();
    this.gains.push(node);
    return node;
  };
  createOscillator = () => {
    const node = new Node();
    this.oscillators.push(node);
    return node;
  };
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
}
const contexts: Context[] = [];
const engines: BinauralEngine[] = [];
function setup() {
  const factory = vi.fn(() => {
    const context = new Context();
    contexts.push(context);
    return context as unknown as AudioContext;
  });
  const engine = new BinauralEngine(factory);
  engines.push(engine);
  return { engine, factory };
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  contexts.splice(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("binaural configuration", () => {
  it("preserves every published preset and the independent carrier difference", () => {
    for (const [mode, band] of Object.entries(modes)) {
      for (const beatHz of band.presets) {
        const config = { ...defaultConfig, mode: mode as keyof typeof modes, beatHz };
        expect(frequencies(config)).toEqual({ left: 200, right: 200 + beatHz, difference: beatHz });
        expect(beatHz).toBeGreaterThanOrEqual(band.min);
        expect(beatHz).toBeLessThanOrEqual(band.max);
      }
    }
    expect(frequencies({ ...defaultConfig, mode: "theta", beatHz: 6 }).right).toBe(206);
    expect(frequencies({ ...defaultConfig, mode: "delta", beatHz: 0.5 }).right).toBe(200.5);
  });
  it("rejects invalid, non-finite, out-of-band and impractical parameters", () => {
    for (const patch of [
      { beatHz: 7 },
      { beatHz: NaN },
      { carrierHz: Infinity },
      { carrierHz: 99 },
      { carrierHz: 501 },
      { durationSeconds: 59 },
      { durationSeconds: 7201 },
      { durationSeconds: 60.5 },
      { toneVolume: -0.01 },
      { backgroundVolume: 1.01 },
      { masterVolume: NaN },
    ])
      expect(() => validateConfig({ ...defaultConfig, ...patch })).toThrow();
    expect(validateConfig({ ...defaultConfig, durationSeconds: 60 }).durationSeconds).toBe(60);
    expect(validateConfig({ ...defaultConfig, durationSeconds: 7200 }).durationSeconds).toBe(7200);
  });
  it("restores only bounded versioned preferences, without private URLs or history", () => {
    const saved = {
      version: 1,
      config: defaultConfig,
      favorites: ["alpha:10", "alpha:10"],
      backgroundId: null,
    };
    expect(parsePreferences(JSON.stringify(saved))?.favorites).toEqual(["alpha:10"]);
    for (const value of [
      null,
      "{",
      "null",
      "x".repeat(4097),
      JSON.stringify({ ...saved, version: 2 }),
      JSON.stringify({ ...saved, favorites: ["theta:99"] }),
      JSON.stringify({ ...saved, backgroundId: "https://private.invalid/signed" }),
      JSON.stringify({ ...saved, config: { ...defaultConfig, masterVolume: 5 } }),
    ])
      expect(parsePreferences(value)).toBeNull();
  });
});

describe("binaural audio lifecycle", () => {
  it("routes each sine into an exclusive stereo input with bounded mix headroom", () => {
    const context = new Context();
    const graph = createBinauralGraph(context as unknown as BaseAudioContext, {
      ...defaultConfig,
      toneVolume: 1,
      backgroundVolume: 1,
    });
    expect(context.oscillators[0].connect).toHaveBeenCalledWith(context.merger, 0, 0);
    expect(context.oscillators[1].connect).toHaveBeenCalledWith(context.merger, 0, 1);
    expect(graph.tone.gain.value + graph.music.gain.value).toBeLessThan(1);
    expect(graph.master.gain.value).toBe(0);
  });
  it("creates nothing before Start and reuses one context and two oscillators across pause/resume", async () => {
    const { engine, factory } = setup();
    expect(factory).not.toHaveBeenCalled();
    await Promise.all([engine.start(), engine.start(), engine.start()]);
    const context = contexts[0];
    expect(factory).toHaveBeenCalledTimes(1);
    expect(context.oscillators).toHaveLength(2);
    context.currentTime = 12;
    engine.pause();
    engine.pause();
    await engine.start();
    expect(engine.getSnapshot().status).toBe("pausing");
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.getSnapshot().elapsedSeconds).toBe(12);
    context.currentTime = 40;
    await vi.advanceTimersByTimeAsync(4000);
    expect(engine.getSnapshot().elapsedSeconds).toBe(12);
    await engine.start();
    context.currentTime = 43;
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getSnapshot().elapsedSeconds).toBe(15);
    expect(context.oscillators[0].stop).toHaveBeenLastCalledWith(928);
    expect(factory).toHaveBeenCalledTimes(1);
    engine.stop();
    engine.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.getSnapshot().status).toBe("idle");
    expect(engine.getSnapshot().elapsedSeconds).toBe(0);
    expect(context.close).toHaveBeenCalledTimes(1);
    for (const node of [...context.oscillators, ...context.gains, context.merger])
      expect(node.disconnect).toHaveBeenCalledTimes(1);
  });
  it("ramps parameter changes and schedules the deadline in the audio clock", async () => {
    const { engine } = setup();
    await engine.start();
    const context = contexts[0];
    context.currentTime = 10;
    engine.configure({
      ...defaultConfig,
      mode: "theta",
      beatHz: 6,
      durationSeconds: 60,
      masterVolume: 0.3,
    });
    expect(context.oscillators[1].frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      206,
      10.1,
    );
    expect(context.gains[2].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.3, 10.8);
    expect(context.gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 60);
    expect(context.oscillators[0].stop).toHaveBeenLastCalledWith(60);
    // The browser fires ended even when the UI thread's interval is throttled.
    context.currentTime = 60;
    context.oscillators[0].onended?.();
    expect(engine.getSnapshot()).toMatchObject({
      status: "completed",
      elapsedSeconds: 60,
      remainingSeconds: 0,
    });
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("requires explicit resume after an OS interruption and recovers a closed context", async () => {
    const { engine, factory } = setup();
    await engine.start();
    contexts[0].currentTime = 8;
    contexts[0].state = "suspended";
    contexts[0].onstatechange?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.getSnapshot().status).toBe("interrupted");
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    contexts[0].state = "closed";
    await engine.start();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot()).toMatchObject({ status: "playing", elapsedSeconds: 8 });
  });
  it("ignores a late resume after Stop and rejects unsupported stereo output", async () => {
    const { engine } = setup();
    let resolveResume!: () => void;
    const start = engine.start();
    // The resumed promise is still pending at this microtask boundary.
    engine.stop();
    await start;
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.getSnapshot().status).toBe("idle");
    const mono = new Context();
    mono.destination.maxChannelCount = 1;
    const unsupported = new BinauralEngine(() => mono as unknown as AudioContext);
    engines.push(unsupported);
    await unsupported.start();
    expect(unsupported.getSnapshot().status).toBe("unsupported");
    expect(mono.close).toHaveBeenCalled();
    // Exercise a genuinely pending resume, cancelled before the browser resolves it.
    const context = new Context();
    context.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResume = resolve;
        }),
    );
    const pending = new BinauralEngine(() => context as unknown as AudioContext);
    engines.push(pending);
    const promise = pending.start();
    pending.stop();
    await vi.advanceTimersByTimeAsync(100);
    resolveResume();
    await promise;
    expect(pending.getSnapshot().status).toBe("idle");
  });
});
