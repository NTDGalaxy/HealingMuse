"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { useAppActions, useOnline, usePersonalData } from "@/components/app-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { MoodCheckin } from "@/lib/types";
import { AccountGate } from "@/features/account/account-gate";
import { MoodTrends } from "./mood-trends";

type Pair = { id: string; date: string; before?: number; after?: number };

/** Before and after check-ins grouped by listening session, oldest session first. */
function pairCheckins(checkins: readonly MoodCheckin[]): Pair[] {
  return Object.values(
    checkins.reduce<Record<string, Pair>>((all, entry) => {
      all[entry.session_id] ??= { id: entry.session_id, date: entry.created_at };
      all[entry.session_id][entry.phase] = entry.score;
      return all;
    }, {}),
  );
}

export function MoodView() {
  const t = useTranslations();
  const { perform } = useAppActions();
  const personal = usePersonalData();
  const locale = useLocale();
  const online = useOnline();
  const [confirm, setConfirm] = useState(false);
  const pairs = pairCheckins(personal?.checkins ?? []);
  return (
    <>
      <PageHeader title={t("mood.title")} subtitle={t("mood.subtitle")} />
      <AccountGate context="mood">
        {!personal?.profile.mood_consent_at ? (
          <div className="panel consent-panel">
            <ShieldCheck size={32} aria-hidden="true" />
            <h2>{t("mood.consentTitle")}</h2>
            <p>{t("mood.consentText")}</p>
            <Button
              disabled={!online}
              onClick={() => void perform("/api/me", { moodConsent: true }, "PATCH")}
            >
              {t("mood.enable")}
            </Button>
          </div>
        ) : (
          // The history keeps one readable width, so Delete stays beside the tables it clears.
          <div className="mood-history">
            <MoodTrends checkins={personal.checkins} />
            <div className="section-heading">
              <h2>{t("mood.recent")}</h2>
              <Button
                variant="secondary"
                danger
                data-part="delete-mood-history"
                disabled={!online || !pairs.length}
                onClick={() => setConfirm(true)}
              >
                {t("mood.deleteAll")}
              </Button>
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
              <EmptyState title={t("mood.empty")} text={t("mood.emptyText")} />
            )}
          </div>
        )}
        <p className="privacy-note">{t("mood.retention")}</p>
        {!online && <p className="info-panel">{t("mood.offline")}</p>}
      </AccountGate>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("mood.deleteTitle")}
        description={t("mood.deleteText")}
        confirmLabel={t("mood.deleteAll")}
        onConfirm={async () => {
          if (await perform("/api/sessions", {}, "DELETE")) setConfirm(false);
        }}
      />
    </>
  );
}
