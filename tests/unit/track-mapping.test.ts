import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
import { fromRow, toRow, trackColumns } from "@/lib/server/catalog";
import { trackRecord } from "@/lib/validation";
import type { Track } from "@/lib/types";

const full: Track = trackRecord.parse({
  id: "10000000-0000-4000-8000-000000000001",
  title: { vi: "Một khoảng bình yên", en: "A quiet beginning" },
  description: { vi: "Mô tả", en: "Description" },
  artist: "Kevin MacLeod",
  category: "instrumental",
  goals: ["relax"],
  genres: ["classical"],
  instruments: ["piano"],
  traditions: [],
  listeningReviewed: true,
  duration: 213,
  source: { kind: "hosted", path: "a/quiet.mp3" },
  downloadAllowed: true,
  artwork: "piano",
  color: "lavender",
  attribution: "Kevin MacLeod",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  provenanceUrl: "https://incompetech.com/",
  status: "published",
  rightsVerified: true,
  humanCreated: true,
  position: 3,
  bytes: 4096,
  sha256: "a".repeat(64),
  changes: "Trimmed silence",
});

describe("track row mapping", () => {
  it("writes the same columns, in the same order, as before", () => {
    expect(Object.keys(toRow(full))).toEqual([
      "id",
      "title",
      "description",
      "artist",
      "category",
      "goals",
      "genres",
      "instruments",
      "traditions",
      "listening_reviewed",
      "duration",
      "source",
      "download_allowed",
      "artwork",
      "color",
      "attribution",
      "license",
      "license_url",
      "provenance_url",
      "status",
      "rights_verified",
      "human_created",
      "position",
      "bytes",
      "sha256",
      "changes",
    ]);
  });

  it("maps every schema field", () => {
    expect(Object.keys(trackColumns).sort()).toEqual(Object.keys(trackRecord.shape).sort());
  });

  it("round-trips a full track", () => {
    expect(fromRow(toRow(full))).toEqual(full);
  });

  it("applies schema defaults for nulls and treats empty optional values as absent", () => {
    const row = {
      ...toRow(full),
      genres: null,
      instruments: null,
      traditions: null,
      listening_reviewed: null,
      bytes: null,
      sha256: null,
      changes: "",
      status: "draft",
    };
    const track = fromRow(row);
    expect(track).toMatchObject({
      genres: [],
      instruments: [],
      traditions: [],
      listeningReviewed: false,
    });
    expect(track).not.toHaveProperty("bytes");
    expect(track).not.toHaveProperty("sha256");
    expect(track).not.toHaveProperty("changes");
    expect(toRow(track)).toMatchObject({ bytes: null, sha256: null, changes: "" });
  });

  it("rejects rows that break the publication rules", () => {
    expect(() => fromRow({ ...toRow(full), rights_verified: false })).toThrow();
  });
});
