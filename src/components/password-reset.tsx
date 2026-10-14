"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { browserClient } from "@/lib/supabase/client";
import { monitor } from "@/lib/browser/monitor";
import { useApp, useOnline } from "./app-state";
import { PageHeading } from "./catalog";
import { PasswordInput } from "./password-input";

export function PasswordResetView() {
  const { user } = useApp();
  return <PasswordResetContent key={user?.id ?? "guest"} />;
}

function PasswordResetContent() {
  const t = useTranslations();
  const locale = useLocale();
  const app = useApp();
  const online = useOnline();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const success = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (saved) success.current?.focus();
  }, [saved]);
  return (
    <>
      <PageHeading title={t("auth.resetTitle")} subtitle={t("auth.resetDescription")} />
      <section className="panel password-reset-panel" aria-busy={busy || app.authLoading}>
        {app.authLoading ? (
          <p role="status">{t("common.loading")}</p>
        ) : !app.user ? (
          <>
            <p>{t("auth.recoveryRequired")}</p>
            <button className="button" onClick={app.openAuth}>
              {t("nav.signIn")}
            </button>
          </>
        ) : saved ? (
          <>
            <p role="status" tabIndex={-1} ref={success}>
              {t("auth.passwordSaved")}
            </p>
            <Link className="button" href={`/${locale}/settings`}>
              {t("nav.account")}
            </Link>
          </>
        ) : (
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setError("");
              setMismatch(false);
              setPasswordInvalid(false);
              if (password !== confirmation) {
                setMismatch(true);
                setError(t("auth.passwordMismatch"));
                document.getElementById("confirm-password")?.focus();
                return;
              }
              const client = browserClient();
              if (!client || !online) {
                setError(t("errors.offline"));
                return;
              }
              setBusy(true);
              try {
                const { data, error: problem } = await client.auth.updateUser({ password });
                if (problem || !data.user) {
                  setPasswordInvalid(
                    problem?.code === "weak_password" || problem?.code === "same_password",
                  );
                  setError(
                    t(
                      problem?.code === "same_password"
                        ? "auth.passwordDifferent"
                        : "auth.passwordUpdateError",
                    ),
                  );
                  monitor("authentication_failed");
                } else {
                  setPassword("");
                  setConfirmation("");
                  setSaved(true);
                }
              } catch {
                setError(t("auth.passwordUpdateError"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p id="password-help" className="muted">
              {t("auth.passwordHelp")}
            </p>
            <PasswordInput
              id="new-password"
              label={t("auth.newPassword")}
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError("");
                setMismatch(false);
                setPasswordInvalid(false);
              }}
              newPassword
              invalid={passwordInvalid}
              disabled={busy}
              describedBy={error ? "password-help password-error" : "password-help"}
            />
            <PasswordInput
              id="confirm-password"
              label={t("auth.confirmPassword")}
              value={confirmation}
              onChange={(value) => {
                setConfirmation(value);
                setError("");
                setMismatch(false);
              }}
              newPassword
              disabled={busy}
              invalid={mismatch}
              describedBy={error ? "password-help password-error" : "password-help"}
            />
            {error && (
              <p className="error" id="password-error" role="alert">
                {error}
              </p>
            )}
            {!online && <p role="status">{t("errors.offline")}</p>}
            <button className="button" disabled={busy || !online}>
              {busy ? t("common.loading") : t("auth.savePassword")}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
