import { describe, it, expect } from "vitest";
import { catalogQueryInput, decodeCursor, paginateTracks } from "../../src/lib/catalog-query";
import type { Track } from "../../src/lib/types";
const fixture = (position: number): Track => ({
  id: `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
  position,
  title: {
    vi: position === 1001 ? "Đàn bầu bên dòng sông" : "Bản thu thử",
    en: `Fixture ${position}`,
  },
  description: { vi: "Dữ liệu thử nghiệm", en: "Synthetic metadata only" },
  artist: "Fixture",
  category: position % 2 ? "instrumental" : "nature",
  goals: ["relax"],
  genres: ["folk"],
  instruments: ["strings"],
  traditions: ["vietnamese"],
  duration: 60,
  source: { kind: "hosted", path: "fixture.mp3" },
  downloadAllowed: false,
  artwork: "forest",
  color: "sage",
  attribution: "Synthetic test metadata only",
  license: "Fixture",
  licenseUrl: "https://example.invalid",
  provenanceUrl: "https://example.invalid",
  status: "published",
  humanCreated: true,
  rightsVerified: true,
  listeningReviewed: true,
});
describe.each([1000, 10000])("catalogue with %i isolated metadata records", (count) => {
  const tracks = Array.from({ length: count }, (_, position) => fixture(position));
  it("walks every page once with stable ordering and bounded results", () => {
    let cursor: string | null = "";
    const ids: string[] = [];
    do {
      const page = paginateTracks([...tracks].reverse(), {
        cursor: cursor || "",
        limit: 24,
        status: "published",
      });
      expect(page.total).toBe(count);
      expect(page.items.length).toBeLessThanOrEqual(24);
      ids.push(...page.items.map((track) => track.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(tracks.map((track) => track.id));
    expect(new Set(ids).size).toBe(count);
  });
  it("keeps retirement and filters out of the next page", () => {
    const first = paginateTracks(tracks, { category: "nature", limit: 24 });
    const changed = tracks.map((track) =>
      track.id === first.items.at(-1)!.id ? { ...track, status: "retired" as const } : track,
    );
    const next = paginateTracks(changed, {
      category: "nature",
      cursor: first.nextCursor!,
      limit: 24,
      status: "published",
    });
    expect(
      next.items.every(
        (track) => track.category === "nature" && track.position > first.items.at(-1)!.position,
      ),
    ).toBe(true);
  });
});
it("finds Vietnamese accents and đ/d beyond row 1000", () => {
  const tracks = Array.from({ length: 10000 }, (_, position) => fixture(position));
  for (const q of ["Đàn bầu", "dan bau", "dòng sông", "dong song"]) {
    const page = paginateTracks(tracks, { q, instrument: "strings", tradition: "vietnamese" });
    expect(page.total).toBe(1);
    expect(page.items[0].position).toBe(1001);
  }
});
it("rejects unbounded limits, malformed cursors and unknown filters", () => {
  expect(catalogQueryInput.safeParse({ limit: 49 }).success).toBe(false);
  expect(catalogQueryInput.safeParse({ genre: "unknown" }).success).toBe(false);
  expect(() => decodeCursor("eA")).toThrow();
  expect(catalogQueryInput.parse({}).limit).toBe(24);
});
it("orders and resumes equal positions by ID without dropping the tail", () => {
  const tracks = [fixture(3), fixture(1), fixture(2)].map((track) => ({
    ...track,
    position: 10000,
  }));
  const first = paginateTracks(tracks, { limit: 1 });
  const second = paginateTracks(tracks, { limit: 1, cursor: first.nextCursor! });
  const third = paginateTracks(tracks, { limit: 1, cursor: second.nextCursor! });
  expect([first.items[0].id, second.items[0].id, third.items[0].id]).toEqual(
    tracks.map((track) => track.id).sort(),
  );
  expect(third.nextCursor).toBeNull();
});
