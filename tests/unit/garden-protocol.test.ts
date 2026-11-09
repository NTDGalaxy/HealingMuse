import { describe, expect, it } from "vitest";
import {
  compatible,
  gardenProtocol,
  readWorkerMessage,
  type HostCommand,
} from "../../src/lib/garden/protocol";

const envelope = (event: unknown, protocol: unknown = gardenProtocol) => ({
  source: "worker",
  protocol,
  event,
});

describe("garden worker protocol", () => {
  it("reads every renderer event of the current version", () => {
    for (const type of ["ready", "failed", "exhausted", "lost"] as const)
      expect(readWorkerMessage(envelope({ type }))).toEqual({ type });
    for (const tier of [0, 1, 2] as const)
      expect(readWorkerMessage(envelope({ type: "quality", tier }))).toEqual({
        type: "quality",
        tier,
      });
  });

  it("reads another protocol version as a renderer failure", () => {
    expect(readWorkerMessage(envelope({ type: "ready" }, gardenProtocol + 1))).toEqual({
      type: "failed",
    });
    expect(readWorkerMessage(envelope({ type: "ready" }, String(gardenProtocol)))).toEqual({
      type: "failed",
    });
    expect(readWorkerMessage({ type: "ready" })).toEqual({ type: "failed" });
  });

  it("reads malformed messages as a renderer failure", () => {
    for (const data of [
      null,
      undefined,
      "ready",
      42,
      envelope(null),
      envelope("ready"),
      envelope({ type: "explode" }),
      envelope({ type: "quality", tier: 3 }),
      envelope({ type: "quality", tier: "1" }),
      envelope({ type: "quality" }),
    ])
      expect(readWorkerMessage(data)).toEqual({ type: "failed" });
  });

  it("copies only the known fields of an event", () => {
    expect(readWorkerMessage(envelope({ type: "ready", extra: true }))).toEqual({ type: "ready" });
  });

  it("accepts the handshake only from a host speaking the same version", () => {
    const init = (protocol: number): Extract<HostCommand, { type: "init" }> => ({
      type: "init",
      protocol,
      canvas: {} as OffscreenCanvas,
      viewport: { width: 390, height: 844 },
      scene: { garden: "lotus", theme: "day" },
    });
    expect(compatible(init(gardenProtocol))).toBe(true);
    expect(compatible(init(gardenProtocol - 1))).toBe(false);
  });
});
