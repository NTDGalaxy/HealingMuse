import type { MoodCheckin } from "./types";

/** Calendar dates use the pilot's Vietnam time zone, including around UTC midnight. */
export function recentMoodDays(entries: MoodCheckin[], now: Date) {
  const day = (date: Date) =>
    new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: day(new Date(now.getTime() - (6 - index) * 86_400_000)),
    before: [] as number[],
    after: [] as number[],
  }));
  for (const entry of entries) {
    const bucket = days.find((item) => item.date === day(new Date(entry.created_at)));
    if (bucket && new Date(entry.created_at) <= now) bucket[entry.phase].push(entry.score);
  }
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : null;
  return days.map((item) => ({
    date: item.date,
    before: mean(item.before),
    after: mean(item.after),
    count: item.before.length + item.after.length,
  }));
}
