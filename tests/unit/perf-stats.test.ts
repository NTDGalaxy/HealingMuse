import { describe, expect, it } from "vitest";
import { percentile, summarize } from "../../scripts/perf/stats.mjs";

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
});
