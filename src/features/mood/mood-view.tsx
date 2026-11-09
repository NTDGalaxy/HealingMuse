"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { useApp, useOnline } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Empty, PageHeading } from "@/components/catalog";
import { recentMoodDays } from "@/lib/wellbeing";
import { AccountGate } from "@/features/account/account-gate";

export function MoodView() {
  const t = useTranslations();
  const app = useApp();
  const locale = useLocale();
  const online = useOnline();
  const [confirm, setConfirm] = useState(false);
  const pairs = Object.values(
    (app.personal?.checkins ?? []).reduce<
      Record<string, { id: string; date: string; before?: number; after?: number }>
    >((all, entry) => {
      all[entry.session_id] ??= { id: entry.session_id, date: entry.created_at };
      all[entry.session_id][entry.phase] = entry.score;
      return all;
    }, {}),
  );
  return (
    <>
      <PageHeading title={t("mood.title")} subtitle={t("mood.subtitle")} />
      <AccountGate context="mood">
        {!app.personal?.profile.mood_consent_at ? (
          <div className="panel consent-panel">
            <ShieldCheck size={32} aria-hidden="true" />
            <h2>{t("mood.consentTitle")}</h2>
            <p>{t("mood.consentText")}</p>
            <button
              className="button"
              disabled={!online}
              onClick={() => void app.perform("/api/me", { moodConsent: true }, "PATCH")}
            >
              {t("mood.enable")}
            </button>
          </div>
        ) : (
          <>
            <MoodTrends />
            <div className="section-heading">
              <h2>{t("mood.recent")}</h2>
              <button
                className="button secondary danger"
                disabled={!online || !pairs.length}
                onClick={() => setConfirm(true)}
              >
                {t("mood.deleteAll")}
              </button>
            </div>
            {pairs.length ? (
              <div className="panel table-wrap">
                <table>
                  <caption>{t("mood.paired")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("mood.date")}</th>
                      <th scope="col">{t("mood.beforeLabel")}</th>
                      <th scope="col">{t("mood.afterLabel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((pair) => (
                      <tr key={pair.id}>
                        <th scope="row">
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(pair.date))}
                        </th>
                        <td>{pair.before ? t(`mood.score${pair.before}`) : t("mood.noAfter")}</td>
                        <td>{pair.after ? t(`mood.score${pair.after}`) : t("mood.noAfter")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={t("mood.empty")} text={t("mood.emptyText")} />
            )}
          </>
        )}
        <p className="privacy-note">{t("mood.retention")}</p>
        {!online && <p className="info-panel">{t("mood.offline")}</p>}
      </AccountGate>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("mood.deleteTitle")}
        description={t("mood.deleteText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            if (await app.perform("/api/sessions", {}, "DELETE")) setConfirm(false);
          }}
        >
          {t("mood.deleteAll")}
        </button>
      </Dialog>
    </>
  );
}
function MoodTrends() {
  const app = useApp();
  const t = useTranslations("mood");
  const locale = useLocale();
  const days = recentMoodDays(app.personal?.checkins ?? [], new Date());
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
