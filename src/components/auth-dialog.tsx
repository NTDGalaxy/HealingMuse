"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { browserClient } from "@/lib/supabase/client";
import { Dialog } from "./dialog";
import { useApp } from "./app-state";
import { monitor } from "@/lib/browser/monitor";

export function AuthDialog() {
  const t = useTranslations();
  const locale = useLocale();
  const { authOpen, closeAuth, announce } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeInvalid, setCodeInvalid] = useState(false);
  const client = browserClient();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    if (!agreed) {
      setError(t("auth.consentRequired"));
      return;
    }
    setBusy(true);
    setError("");
    setCodeInvalid(false);
    try {
      if (sent) {
        const { error: problem } = await client.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        if (problem) {
          setError(t("auth.invalidCode"));
          setCodeInvalid(true);
          monitor("authentication_failed");
        } else {
          closeAuth();
          setCode("");
          setSent(false);
        }
      } else {
        const { error: problem } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true, data: { locale } },
        });
        if (problem) {
          setError(t(problem.status === 429 ? "auth.rateLimit" : "auth.sendError"));
          monitor("authentication_failed");
        } else {
          setSent(true);
          announce(t("auth.sent"));
        }
      }
    } catch {
      setError(t("auth.sendError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={authOpen}
      onOpenChange={(open) => {
        if (!open) closeAuth();
      }}
      title={t("auth.title")}
      description={t("auth.subtitle")}
    >
      {!client ? (
        <p className="info-panel">{t("auth.unavailable")}</p>
      ) : (
        <form onSubmit={submit} className="form-stack" aria-busy={busy}>
          <label htmlFor="auth-email">{t("auth.email")}</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={sent || busy}
            aria-describedby={!sent && error ? "auth-error" : undefined}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
          />
          {sent && (
            <>
              <label htmlFor="auth-code">{t("auth.code")}</label>
              <p id="code-help" className="muted">
                {t("auth.codeNote")}
              </p>
              <input
                id="auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                required
                aria-describedby={error ? "code-help auth-error" : "code-help"}
                aria-invalid={codeInvalid || undefined}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeInvalid(false);
                  setError("");
                }}
              />
            </>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              required
            />
            <span>
              {t("auth.agree")} <a href={`/${locale}/privacy`}>{t("nav.privacy")}</a> /{" "}
              <a href={`/${locale}/terms`}>{t("nav.terms")}</a>
            </span>
          </label>
          {error && (
            <p id="auth-error" className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? t("common.loading") : t(sent ? "auth.verify" : "auth.sendCode")}
          </button>
          {sent && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
              disabled={busy}
            >
              {t("auth.changeEmail")}
            </button>
          )}
          <p className="muted small">{t("auth.noPassword")}</p>
        </form>
      )}
    </Dialog>
  );
}
