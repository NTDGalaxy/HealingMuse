import { describe, expect, it } from "vitest";
import { percentile, sceneOrder, summarize } from "../../scripts/perf/stats.mjs";

const row = (readinessMs: number | null, audioMs: number | null = null) => ({
  readinessMs,
  audioMs,
  lcpMs: 500,
  cls: 0.01,
  interactionMs: 40,
  sceneReadyMs: 4000,
  errors: 0,
});

describe("timed gate statistics", () => {
  it("uses nearest-rank percentiles and ignores missing values", () => {
    const values = Array.from({ length: 30 }, (_, index) => (index + 1) * 100);
    expect(percentile(values, 0.95)).toBe(2900);
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([Number.NaN, 5], 0.95)).toBe(5);
  });

  it("passes only with enough samples, no missing readings and p95 within the threshold", () => {
    const rule = { audio: true, thresholdMs: 3000, minSamples: 30 };
    const good = Array.from({ length: 30 }, () => row(2500, 1200));
    expect(summarize(good, rule).passed).toBe(true);
    expect(summarize(good.slice(0, 29), rule).passed).toBe(false);
    expect(summarize([...good.slice(1), row(null, 1200)], rule).passed).toBe(false);
    expect(summarize([...good.slice(1), row(2500, null)], rule).missingAudio).toBe(1);
    const slow = [...good.slice(2), row(3100, 1200), row(3200, 1200)];
    expect(summarize(slow, rule).readinessP95Ms).toBe(3100);
    expect(summarize(slow, rule).passed).toBe(false);
    expect(summarize(good, { ...rule, audio: false }).audioP95Ms).toBeNull();
  });

  it("classifies when the scene started relative to the tap and the first sound", () => {
    const times = { clickMs: 1000, audioAtMs: 1800 };
    expect(sceneOrder({ ...times, sceneStartMs: 1800 })).toBe("after-audio");
    expect(sceneOrder({ ...times, sceneStartMs: 2500 })).toBe("after-audio");
    expect(sceneOrder({ ...times, sceneStartMs: 1200 })).toBe("before-audio");
    expect(sceneOrder({ ...times, sceneStartMs: 900 })).toBe("before-tap");
    expect(sceneOrder({ ...times, sceneStartMs: null })).toBe("no-scene");
    expect(sceneOrder({ clickMs: 1000, audioAtMs: 0, sceneStartMs: 1200 })).toBe("no-audio");
    expect(sceneOrder({ clickMs: 0, audioAtMs: 0, sceneStartMs: 1200 })).toBe("no-tap");
  });

  it("counts scene orders per cell without affecting the verdict", () => {
    const rule = { audio: true, thresholdMs: 3000, minSamples: 3 };
    const rows = [
      { ...row(2500, 1200), sceneOrder: "after-audio" as const },
      { ...row(2500, 1200), sceneOrder: "after-audio" as const },
      { ...row(2500, 1200), sceneOrder: "before-audio" as const },
    ];
    expect(summarize(rows, rule)).toMatchObject({
      sceneOrder: { "after-audio": 2, "before-audio": 1 },
      passed: true,
    });
    expect(summarize([row(2500, 1200)], rule).sceneOrder).toEqual({});
  });
});
