import { describe, expect, it, vi } from "vitest";
import { onDemand } from "../../src/lib/on-demand";

describe("on-demand code", () => {
  it("imports once, shares a pending import and keeps what arrived", async () => {
    const load = vi.fn(async () => "module");
    const code = onDemand(load);
    expect(code.getSnapshot()).toEqual({ state: "idle" });
    const [first, second] = [code.load(), code.load()];
    expect(code.getSnapshot()).toEqual({ state: "loading" });
    expect(await first).toBe("module");
    expect(await second).toBe("module");
    expect(await code.load()).toBe("module");
    expect(load).toHaveBeenCalledTimes(1);
    expect(code.getSnapshot()).toEqual({ state: "loaded", value: "module" });
    expect(code.getServerSnapshot?.()).toEqual({ state: "idle" });
  });
  it("never keeps a failed import: the next call imports again", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("module");
    const code = onDemand(load);
    const listener = vi.fn();
    code.subscribe(listener);
    await expect(code.load()).rejects.toThrow("offline");
    expect(code.getSnapshot()).toEqual({ state: "failed" });
    expect(await code.load()).toBe("module");
    expect(load).toHaveBeenCalledTimes(2);
    // loading, failed, loading, loaded
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
