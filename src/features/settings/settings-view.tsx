"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  useAppActions,
  useMoodConsent,
  useOnline,
  usePersonalError,
  usePersonalPending,
  useUser,
} from "@/components/app-state";
import { AppearanceControls } from "@/components/appearance";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { InstallSection } from "./install-section";

export function SettingsView() {
  const t = useTranslations();
  const locale = useLocale();
  const actions = useAppActions();
  const user = useUser();
  const consent = useMoodConsent();
  const error = usePersonalError();
  const pending = usePersonalPending();
  const online = useOnline();
  const [deleting, setDeleting] = useState(false);
  const [revoke, setRevoke] = useState(false);
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="settings-stack">
        <section className="panel settings-appearance">
          <h2>{t("settings.appearance")}</h2>
          <AppearanceControls primary />
          <div className="setting-row">
            <strong>{t("settings.language")}</strong>
            <div className="language-switch">
              {["vi", "en"].map((language) => (
                <Link
                  href={`/${language}/settings`}
                  lang={language}
                  key={language}
                  aria-current={language === locale ? "true" : undefined}
                >
                  {language === "vi" ? "Tiếng Việt" : "English"}
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className={`panel settings-account${user ? "" : " settings-account-guest"}`}>
          <h2>{t("settings.account")}</h2>
          {user ? (
            <>
              <p className="settings-identity">{user.email}</p>
              <div className="settings-actions">
                <Link className="text-link" href={`/${locale}/reset-password`}>
                  {t("auth.managePassword")}
                </Link>
                <Button variant="secondary" onClick={() => void actions.signOut()}>
                  {t("auth.signOut")}
                </Button>
              </div>
              <div className="settings-account-footer">
                <Button variant="secondary" danger onClick={() => setDeleting(true)}>
                  {t("settings.deleteAccount")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>{t("settings.guestText")}</p>
              <div className="settings-actions">
                <Button onClick={actions.openAuth}>{t("nav.signIn")}</Button>
              </div>
            </>
          )}
        </section>
        {user && (
          <section className="panel settings-privacy">
            <h2>{t("settings.privacy")}</h2>
            <p>{t("mood.consentText")}</p>
            {pending ? (
              // Until personal data arrives the choice is unknown; never offer it again meanwhile.
              <p role="status">{t("common.loading")}</p>
            ) : (
              <>
                <p className="muted">{t(consent ? "settings.enabled" : "settings.disabled")}</p>
                <div className="settings-actions">
                  <Button
                    variant="secondary"
                    disabled={!online}
                    onClick={() =>
                      consent
                        ? setRevoke(true)
                        : void actions.perform("/api/me", { moodConsent: true }, "PATCH")
                    }
                  >
                    {t(consent ? "mood.revoke" : "mood.enable")}
                  </Button>
                  <Link className="text-link" href={`/${locale}/mood`}>
                    {t("nav.mood")}
                  </Link>
                </div>
              </>
            )}
          </section>
        )}
        <InstallSection />
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
      <ConfirmDialog
        open={revoke}
        onOpenChange={setRevoke}
        title={t("mood.consentTitle")}
        description={t("mood.deleteText")}
        confirmLabel={t("mood.revoke")}
        onConfirm={async () => {
          if (await actions.perform("/api/me", { moodConsent: false }, "PATCH")) setRevoke(false);
        }}
      />
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </>
  );
}
