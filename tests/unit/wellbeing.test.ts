import { describe, expect, it } from "vitest";
import { recentMoodDays } from "@/lib/wellbeing";
import type { MoodCheckin } from "@/lib/types";
describe("personal mood summaries", () => {
  it("groups Vietnam calendar days, excludes old and future entries, and preserves missing phases", () => {
    const entry = (date: string, phase: "before" | "after", score: number): MoodCheckin => ({
      id: date,
      session_id: date,
      created_at: date,
      phase,
      score,
    });
    const days = recentMoodDays(
      [
        entry("2026-10-08T18:00:00Z", "before", 2),
        entry("2026-10-09T02:00:00Z", "before", 4),
        entry("2026-10-09T03:00:00Z", "after", 5),
        entry("2026-10-01T03:00:00Z", "after", 1),
        entry("2026-10-09T14:00:00Z", "after", 1),
      ],
      new Date("2026-10-09T12:00:00Z"),
    );
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ date: "2026-10-09", before: 3, after: 5, count: 3 });
    expect(days[0]).toEqual({ date: "2026-10-03", before: null, after: null, count: 0 });
  });
});
