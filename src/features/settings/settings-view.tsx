"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useApp, useOnline } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { PageHeading } from "@/components/catalog";
import { AppearanceControls } from "@/components/appearance";
import { mutation } from "@/lib/browser/api";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function SettingsView() {
  const t = useTranslations();
  const locale = useLocale();
  const app = useApp();
  const online = useOnline();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  return (
    <>
      <PageHeading title={t("settings.title")} subtitle={t("settings.subtitle")} />
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
        <section className={`panel settings-account${app.user ? "" : " settings-account-guest"}`}>
          <h2>{t("settings.account")}</h2>
          {app.user ? (
            <>
              <p className="settings-identity">{app.user.email}</p>
              <div className="settings-actions">
                <Link className="text-link" href={`/${locale}/reset-password`}>
                  {t("auth.managePassword")}
                </Link>
                <button className="button secondary" onClick={() => void app.signOut()}>
                  {t("auth.signOut")}
                </button>
              </div>
              <div className="settings-account-footer">
                <button className="button secondary danger" onClick={() => setDeleting(true)}>
                  {t("settings.deleteAccount")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{t("settings.guestText")}</p>
              <div className="settings-actions">
                <button className="button" onClick={app.openAuth}>
                  {t("nav.signIn")}
                </button>
              </div>
            </>
          )}
        </section>
        {app.user && (
          <section className="panel settings-privacy">
            <h2>{t("settings.privacy")}</h2>
            <p>{t("mood.consentText")}</p>
            <p className="muted">
              {t(app.personal?.profile.mood_consent_at ? "settings.enabled" : "settings.disabled")}
            </p>
            <div className="settings-actions">
              <button
                className="button secondary"
                disabled={!online}
                onClick={() =>
                  app.personal?.profile.mood_consent_at
                    ? setRevoke(true)
                    : void app.perform("/api/me", { moodConsent: true }, "PATCH")
                }
              >
                {t(app.personal?.profile.mood_consent_at ? "mood.revoke" : "mood.enable")}
              </button>
              <Link className="text-link" href={`/${locale}/mood`}>
                {t("nav.mood")}
              </Link>
            </div>
          </section>
        )}
        <section className="panel settings-install">
          <h2>{t("settings.install")}</h2>
          <p>{t("settings.installText")}</p>
          {install ? (
            <button
              className="button"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              }}
            >
              {t("settings.installButton")}
            </button>
          ) : (
            <p className="muted small">{t("settings.installManual")}</p>
          )}
        </section>
      </div>
      {app.error && (
        <p className="error" role="alert">
          {app.error}
        </p>
      )}
      <Dialog
        open={revoke}
        onOpenChange={setRevoke}
        title={t("mood.consentTitle")}
        description={t("mood.deleteText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            if (await app.perform("/api/me", { moodConsent: false }, "PATCH")) setRevoke(false);
          }}
        >
          {t("mood.revoke")}
        </button>
      </Dialog>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("settings.deleteTitle")}
        description={t("settings.deleteText")}
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (confirmation !== "DELETE") return;
            setBusy(true);
            try {
              await mutation("/api/me", { confirmation }, "DELETE", app.user?.id);
              await app.signOut();
              setDeleting(false);
              app.announce(t("settings.deleted"));
            } catch {
              app.announce(t("errors.unavailable"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="delete-confirm">{t("settings.confirmation")}</label>
          <input
            id="delete-confirm"
            value={confirmation}
            autoComplete="off"
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <button className="button danger" disabled={confirmation !== "DELETE" || busy || !online}>
            {t("settings.confirmDelete")}
          </button>
        </form>
      </Dialog>
    </>
  );
}
