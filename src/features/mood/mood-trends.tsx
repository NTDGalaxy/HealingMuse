"use client";
import { useLocale, useTranslations } from "next-intl";
import type { MoodCheckin } from "@/lib/types";
import { recentMoodDays } from "@/lib/wellbeing";

/** Daily before and after averages for the recent days, in Vietnam's calendar. */
export function MoodTrends({ checkins }: { checkins: MoodCheckin[] }) {
  const t = useTranslations("mood");
  const locale = useLocale();
  const days = recentMoodDays(checkins, new Date());
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  const format = (value: number | null) =>
    value === null ? t("noAfter") : `${number.format(value)} / 5`;
  return (
    <section className="mood-trends panel table-wrap" aria-labelledby="mood-trend-heading">
      <h2 id="mood-trend-heading">{t("trendTitle")}</h2>
      <p>{t("trendNote")}</p>
      <table>
        <caption className="sr-only">{t("trendTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("date")}</th>
            <th scope="col">{t("beforeLabel")}</th>
            <th scope="col">{t("afterLabel")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(`${day.date}T00:00:00+07:00`))}
              </th>
              <td>{format(day.before)}</td>
              <td>{format(day.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
