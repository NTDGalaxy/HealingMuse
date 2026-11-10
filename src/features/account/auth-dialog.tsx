"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { isConfigured } from "@/lib/supabase/config";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { CheckboxField, TextField } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "./password-input";
import { useAppActions, useAuthOpen } from "@/components/app-state";
import { monitor } from "@/lib/browser/monitor";

type Method = "password" | "code" | "recovery";

export function AuthDialog() {
  const t = useTranslations();
  const locale = useLocale();
  const { closeAuth, announce, loadAuthClient } = useAppActions();
  const authOpen = useAuthOpen();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const attempt = useRef(0);
  // Closed from outside (an account arrived while it was open): the next opening starts afresh,
  // as it does after the listener closes it.
  const [shown, setShown] = useState(authOpen);
  if (shown !== authOpen) {
    setShown(authOpen);
    if (!authOpen) {
      setMethod("password");
      setPassword("");
      setCode("");
      setSent(false);
      setError("");
      setInvalid(false);
      setBusy(false);
      setAgreed(false);
    }
  }

  function focusInput(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  function chooseMethod(next: Method = "password") {
    reset(next);
    focusInput("auth-email");
  }

  function reset(next: Method = "password") {
    attempt.current++;
    setMethod(next);
    setPassword("");
    setCode("");
    setSent(false);
    setError("");
    setInvalid(false);
    setBusy(false);
  }
  function dismiss() {
    reset();
    setAgreed(false);
    closeAuth();
  }
  function failure(problem: { code?: string; status?: number }, fallback: string) {
    setError(
      t(
        problem.code === "over_email_send_rate_limit"
          ? "auth.emailLimit"
          : problem.status === 429
            ? "auth.rateLimit"
            : fallback,
      ),
    );
    monitor("authentication_failed");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (method !== "recovery" && !agreed) {
      setError(t("auth.consentRequired"));
      return;
    }
    const current = ++attempt.current;
    setBusy(true);
    setError("");
    setInvalid(false);
    try {
      // Opening the dialog started the download, so this rarely waits.
      const client = await loadAuthClient();
      if (current !== attempt.current) return;
      if (!client) throw new Error("unavailable");
      if (method === "password") {
        const { data, error: problem } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (current !== attempt.current) return;
        if (problem || !data.session) {
          failure(
            problem ?? {},
            problem?.code === "email_not_confirmed"
              ? "auth.emailUnconfirmed"
              : "auth.invalidCredentials",
          );
          setInvalid(problem?.code === "invalid_credentials");
        } else {
          dismiss();
          announce(t("auth.signedIn"));
        }
      } else if (method === "recovery") {
        const { error: problem } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL("/" + locale + "/reset-password", window.location.origin).href,
        });
        if (current !== attempt.current) return;
        if (problem) failure(problem, "auth.recoveryError");
        else {
          setSent(true);
          focusInput("auth-recovery-status");
        }
      } else if (sent) {
        const { data, error: problem } = await client.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        if (current !== attempt.current) return;
        if (problem || !data.session) {
          failure(problem ?? {}, "auth.invalidCode");
          setInvalid(problem?.status !== 429);
        } else {
          dismiss();
          announce(t("auth.signedIn"));
        }
      } else {
        const { error: problem } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true, data: { locale } },
        });
        if (current !== attempt.current) return;
        if (problem) failure(problem, "auth.sendError");
        else {
          setSent(true);
          announce(t("auth.sent"));
          focusInput("auth-code");
        }
      }
    } catch {
      if (current === attempt.current)
        setError(
          t(
            method === "password"
              ? "auth.signInError"
              : method === "recovery"
                ? "auth.recoveryError"
                : "auth.sendError",
          ),
        );
    } finally {
      if (current === attempt.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open={authOpen}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      title={t(method === "recovery" ? "auth.recoveryTitle" : "auth.title")}
      description={t(method === "recovery" ? "auth.recoveryDescription" : "auth.subtitle")}
    >
      {!isConfigured ? (
        <p className="info-panel">{t("auth.unavailable")}</p>
      ) : method === "recovery" && sent ? (
        <div className="form-stack">
          <p role="status" id="auth-recovery-status" tabIndex={-1}>
            {t("auth.recoverySent")}
          </p>
          <Button variant="secondary" onClick={() => chooseMethod()}>
            {t("auth.backToPassword")}
          </Button>
        </div>
      ) : (
        <form key={`${method}-${sent}`} onSubmit={submit} className="form-stack" aria-busy={busy}>
          <TextField
            id="auth-email"
            label={t("auth.email")}
            name="email"
            type="email"
            autoComplete={method === "password" ? "username" : "email"}
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            disabled={sent || busy}
            aria-invalid={(method === "password" && invalid) || undefined}
            aria-describedby={error ? "auth-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
              setInvalid(false);
            }}
            placeholder={t("auth.emailPlaceholder")}
          />
          {method === "password" && (
            <PasswordInput
              id="auth-password"
              label={t("auth.password")}
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError("");
                setInvalid(false);
              }}
              disabled={busy}
              invalid={invalid}
              describedBy={error ? "auth-error" : undefined}
            />
          )}
          {method === "code" &&
            (sent ? (
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
                  disabled={busy}
                  aria-describedby={error ? "code-help auth-error" : "code-help"}
                  aria-invalid={invalid || undefined}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setInvalid(false);
                    setError("");
                  }}
                />
              </>
            ) : (
              <p className="muted small">{t("auth.codeSetup")}</p>
            ))}
          {method !== "recovery" && (
            <CheckboxField
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              required
              disabled={busy}
              label={
                // Client navigation keeps the persistent player; the dialog closes to show the page.
                <span>
                  {t("auth.agree")}{" "}
                  <Link href={"/" + locale + "/privacy"} onClick={dismiss}>
                    {t("nav.privacy")}
                  </Link>{" "}
                  /{" "}
                  <Link href={"/" + locale + "/terms"} onClick={dismiss}>
                    {t("nav.terms")}
                  </Link>
                </span>
              }
            />
          )}
          {error && <InlineAlert id="auth-error">{error}</InlineAlert>}
          <Button disabled={busy}>
            {busy
              ? t("common.loading")
              : t(
                  method === "recovery"
                    ? "auth.sendRecovery"
                    : method === "password" || sent
                      ? "auth.verify"
                      : "auth.sendCode",
                )}
          </Button>
          {method === "password" ? (
            <div className="auth-options">
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => chooseMethod("recovery")}
              >
                {t("auth.forgotPassword")}
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => chooseMethod("code")}
              >
                {t("auth.useEmailCode")}
              </button>
            </div>
          ) : (
            <>
              {method === "code" && sent && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => chooseMethod("code")}
                  disabled={busy}
                >
                  {t("auth.changeEmail")}
                </Button>
              )}
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => chooseMethod()}
              >
                {t("auth.backToPassword")}
              </button>
            </>
          )}
          <p className="muted small">{t("auth.guestNote")}</p>
        </form>
      )}
    </Dialog>
  );
}
