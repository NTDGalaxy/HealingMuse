import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  deliverSubsetTrack,
  subsetLimits,
  hashJson,
  subsetTracks,
} from "../../scripts/lib/supabase-subset.mjs";

const audio = Buffer.from("synthetic music fixture");
const track = {
  id: "10000000-0000-4000-8000-000000000001",
  source: { kind: "hosted", path: "fixture.mp3" },
  bytes: audio.length,
  sha256: createHash("sha256").update(audio).digest("hex"),
  status: "draft",
};
function fixture(
  options: { uncertain?: boolean; absent?: boolean; corrupt?: boolean; noEgress?: boolean } = {},
) {
  let object: { id: string; bytes: number; updatedAt: string } | null = null;
  let checkpoint: Record<string, unknown> | undefined;
  const upload = vi.fn(async () => {
    if (!options.absent)
      object = { id: "object-one", bytes: audio.length, updatedAt: "2026-10-14T00:00:00.000Z" };
    if (options.uncertain) throw new Error("uncertain");
  });
  const download = vi.fn(async () => (options.corrupt ? Buffer.alloc(audio.length) : audio));
  const record = vi.fn(async () => {});
  const args = {
    track,
    audio,
    inspect: async () => object,
    upload,
    download,
    record,
    assertCapacity: vi.fn(async () => {}),
    reserve: vi.fn(async (kind: string) => {
      if (kind === "egress" && options.noEgress) throw new Error("egress_budget_exhausted");
    }),
    save: async (value: Record<string, unknown>) => {
      checkpoint = value;
    },
  };
  return { args, upload, download, record, checkpoint: () => checkpoint };
}
describe("Supabase Free subset boundaries", () => {
  it("uses exact organization bytes and preserves the reserve and allocation cap", () => {
    const evidence = {
      version: 1,
      plan: "free",
      freeOnly: true,
      organizationProjects: 1,
      otherProjectStorageBytes: 0,
      organizationStorageBytes: 73480982,
      globalFileLimitBytes: 50000000,
      egressBudgetBytes: 4000000000,
      checkedAt: new Date().toISOString(),
    };
    expect(subsetLimits(evidence).uploadBytes).toBe(726519018);
    expect(subsetLimits({ ...evidence, organizationStorageBytes: 0 }).uploadBytes).toBe(750000000);
    expect(subsetLimits({ ...evidence, organizationStorageBytes: 900000000 }).uploadBytes).toBe(0);
    expect(() => subsetLimits({ ...evidence, plan: "pro" })).toThrow("account_limits_unconfirmed");
    expect(() => subsetLimits(evidence, Date.now() + 86400001)).toThrow(
      "account_limits_unconfirmed",
    );
  });
  it("rejects altered selections and retired recordings even with a recalculated selection hash", () => {
    const catalogue = [track];
    const payload = {
      inputs: { catalogueSha256: hashJson(catalogue) },
      items: [
        {
          recordingId: track.id,
          status: "selected_provisional",
          sha256: track.sha256,
          originalFileBytes: track.bytes,
          expectedSupabaseObjectPath: track.source.path,
        },
      ],
    };
    const selection = { ...payload, selectionHash: hashJson(payload) };
    expect(subsetTracks(catalogue, selection)).toEqual(catalogue);
    expect(() => subsetTracks(catalogue, { ...selection, selectionHash: "changed" })).toThrow(
      "selection_changed",
    );
    expect(() => subsetTracks([{ ...track, status: "retired" }], selection)).toThrow(
      "selection_changed",
    );
  });
  it("reconciles an uncertain committed write without overwriting or redownloading on resume", async () => {
    const f = fixture({ uncertain: true });
    await deliverSubsetTrack(f.args);
    await deliverSubsetTrack({ ...f.args, checkpoint: f.checkpoint() });
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.download).toHaveBeenCalledOnce();
    expect(f.record).toHaveBeenCalledTimes(2);
  });
  it("retains a writing checkpoint and refuses another upload after uncertain absence", async () => {
    const f = fixture({ uncertain: true, absent: true });
    await expect(deliverSubsetTrack(f.args)).rejects.toThrow("uncertain");
    expect(f.checkpoint()?.state).toBe("writing");
    await expect(deliverSubsetTrack({ ...f.args, checkpoint: f.checkpoint() })).rejects.toThrow(
      "uncertain_write",
    );
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.record).not.toHaveBeenCalled();
  });
  it("reserves egress before writing and refuses corrupted remote bytes", async () => {
    const empty = fixture({ noEgress: true });
    await expect(deliverSubsetTrack(empty.args)).rejects.toThrow("egress_budget_exhausted");
    expect(empty.upload).not.toHaveBeenCalled();
    const corrupt = fixture({ corrupt: true });
    await expect(deliverSubsetTrack(corrupt.args)).rejects.toThrow("remote_integrity_mismatch");
    expect(corrupt.checkpoint()?.state).toBe("uploaded");
    expect(corrupt.record).not.toHaveBeenCalled();
  });
  it("retains the original reservations when an explicitly reconciled absent write is retried", async () => {
    const options = { uncertain: true, absent: true };
    const f = fixture(options);
    await expect(deliverSubsetTrack(f.args)).rejects.toThrow("uncertain");
    options.uncertain = false;
    options.absent = false;
    await deliverSubsetTrack({
      ...f.args,
      checkpoint: { ...f.checkpoint(), state: "retry_ready" },
    });
    expect(f.args.reserve.mock.calls.filter(([kind]) => kind === "upload")).toHaveLength(1);
    expect(f.args.reserve.mock.calls.filter(([kind]) => kind === "egress")).toHaveLength(1);
    expect(f.record).toHaveBeenCalledOnce();
  });
  it("refuses local corruption before any storage operation", async () => {
    const f = fixture();
    await expect(
      deliverSubsetTrack({ ...f.args, audio: Buffer.alloc(audio.length) }),
    ).rejects.toThrow("local_integrity_mismatch");
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.download).not.toHaveBeenCalled();
  });
  it("retries a transport interruption only after independent absence confirmation", async () => {
    const f = fixture();
    f.upload.mockRejectedValueOnce(
      Object.assign(new Error("transport"), {
        diagnostic: {
          transportFailure: true,
          quotaIndicated: false,
          authorizationIndicated: false,
        },
      }),
    );
    const missing = vi.fn(async () => true);
    await deliverSubsetTrack({ ...f.args, confirmMissing: missing });
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(missing).toHaveBeenCalledOnce();
    expect(f.args.reserve.mock.calls.filter(([kind]) => kind === "upload")).toHaveLength(1);
    expect(f.download).toHaveBeenCalledOnce();
  });
  it("stops immediately on quota or authorization errors even when the object is absent", async () => {
    for (const kind of ["quotaIndicated", "authorizationIndicated"]) {
      const f = fixture();
      f.upload.mockRejectedValueOnce(
        Object.assign(new Error("provider_limit"), {
          diagnostic: { transportFailure: true, [kind]: true },
        }),
      );
      await expect(
        deliverSubsetTrack({ ...f.args, confirmMissing: async () => true }),
      ).rejects.toThrow("provider_limit");
      expect(f.upload).toHaveBeenCalledOnce();
      expect(f.record).not.toHaveBeenCalled();
    }
  });
});
