import { describe, expect, it } from "vitest";
import { parseRange } from "../../src/lib/audio";
import { capabilities, playlistEdit, sessionInput, trackSource } from "../../src/lib/validation";
import en from "../../src/messages/en.json";
import vi from "../../src/messages/vi.json";
describe("portable hosted playback", () => {
  it("handles byte ranges, suffixes, clamping, and invalid requests", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=90-999", 100)).toEqual({ start: 90, end: 99 });
    for (const range of [
      "bytes=100-",
      "bytes=30-20",
      "bytes=-0",
      "bytes=0-2,4-6",
      "bytes=",
      "bananas",
    ])
      expect(parseRange(range, 100)).toBe("invalid");
  });
  it("rejects path traversal and unrelated Spotify hosts", () => {
    expect(trackSource.safeParse({ kind: "hosted", path: "../private.mp3" }).success).toBe(false);
    expect(
      trackSource.safeParse({
        kind: "spotify_link",
        url: "https://open.spotify.com.evil.org/track/a",
      }).success,
    ).toBe(false);
  });
  it("never permits downloads for external services", () => {
    expect(capabilities({ kind: "youtube", videoId: "abcdefghijk" }, true).download).toBe(false);
    expect(
      capabilities({ kind: "spotify_link", url: "https://open.spotify.com/track/example" }, true)
        .download,
    ).toBe(false);
  });
});
describe("private mutations", () => {
  it("requires a revision and unique playlist recordings", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(playlistEdit.safeParse({ title: "Quiet", trackIds: [id] }).success).toBe(false);
    expect(
      playlistEdit.safeParse({ title: "Quiet", revision: 0, trackIds: [id, id] }).success,
    ).toBe(false);
  });
  it("rejects mood values and extra patient data outside the contract", () => {
    const trackId = "00000000-0000-4000-8000-000000000001";
    expect(sessionInput.safeParse({ trackId, beforeScore: 0 }).success).toBe(false);
    expect(sessionInput.safeParse({ trackId, beforeScore: 3, diagnosis: "private" }).success).toBe(
      false,
    );
  });
});
it("keeps Vietnamese and English keys in parity", () => {
  const keys = (value: object, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === "object" ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );
  expect(keys(vi).sort()).toEqual(keys(en).sort());
});
