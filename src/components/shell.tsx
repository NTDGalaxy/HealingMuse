"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  House,
  Compass,
  Library,
  Download,
  Heart,
  Settings,
  Leaf,
  ArrowRight,
  ShieldCheck,
  Headphones,
  MoreHorizontal,
} from "lucide-react";
import { useApp, useOnline } from "./app-state";
import { AuthDialog } from "./auth-dialog";
import { Scenery } from "./scenery";
import { isConfigured } from "@/lib/supabase/config";
import { useEffect, useState } from "react";
import { AppearanceButton } from "./appearance";
import { Dialog } from "./dialog";
import type { Locale } from "@/lib/types";

const links = [
  ["home", "", House],
  ["explore", "/explore", Compass],
  ["binaural", "/brainwave-entrainment", Headphones],
  ["library", "/library", Library],
  ["downloads", "/downloads", Download],
  ["mood", "/mood", Heart],
  ["settings", "/settings", Settings],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const app = useApp();
  const online = useOnline();
  const [more, setMore] = useState(false);
  useEffect(() => {
    const revealFocus = (event: FocusEvent) => {
      const element = event.target;
      // Text clicks focus the tabindex=-1 main container. Its bottom is the whole page,
      // not a covered control. Leave pointer focus and skip-link targets to the browser.
      if (
        !(element instanceof HTMLElement) ||
        element.id === "main-content" ||
        !element.closest("#main-content") ||
        !element.matches(":focus-visible")
      )
        return;
      const overlays = [...document.querySelectorAll(".mobile-nav, .player-bar")]
        .map((overlay) => overlay.getBoundingClientRect())
        .filter((box) => box.height > 0);
      const bottom = Math.min(innerHeight, ...overlays.map((box) => box.top));
      const box = element.getBoundingClientRect();
      if (box.bottom > bottom - 16)
        window.scrollBy({ top: box.bottom - bottom + 24, behavior: "instant" });
    };
    document.addEventListener("focusin", revealFocus);
    return () => document.removeEventListener("focusin", revealFocus);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* Online listening remains available. */
      });
  }, []);
  const active = (suffix: string) => pathname === `/${locale}${suffix}`;
  return (
    <div className={`app-shell ${app.calm ? "calm-mode" : ""}`}>
      <Scenery pathname={pathname} calm={app.calm} />
      <a className="skip-link" href="#main-content">
        {t("nav.skip")}
      </a>
      <aside className="sidebar">
        <Link className="brand" href={`/${locale}`} aria-label="HealingMuse">
          <span className="brand-mark">
            <Leaf size={25} aria-hidden="true" />
          </span>
          <span>
            Healing<span className="brand-accent">Muse</span>
            <small>{t("nav.tagline")}</small>
          </span>
        </Link>
        <nav aria-label={t("nav.label")} className="side-nav">
          {links.map(([key, suffix, Icon]) => (
            <Link
              key={key}
              href={`/${locale}${suffix}`}
              aria-current={active(suffix) ? "page" : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{t(`nav.${key}`)}</span>
            </Link>
          ))}
          {app.personal?.isAdmin && (
            <Link href={`/${locale}/admin`} aria-current={active("/admin") ? "page" : undefined}>
              <ShieldCheck size={21} aria-hidden="true" />
              {t("nav.admin")}
            </Link>
          )}
        </nav>
        <div className="sidebar-note">
          <Leaf size={22} aria-hidden="true" />
          <p>{t("home.gentleNote")}</p>
        </div>
        <div className="sidebar-footer">
          <Link href={`/${locale}/privacy`}>{t("nav.privacy")}</Link>
          <span>·</span>
          <Link href={`/${locale}/terms`}>{t("nav.terms")}</Link>
          <Link href={`/${locale}/credits`}>{t("nav.credits")}</Link>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <Link href={`/${locale}`} className="mobile-brand">
            <Leaf size={22} aria-hidden="true" />
            HealingMuse
          </Link>
          <span className="topbar-welcome">{t(isConfigured ? "home.welcome" : "nav.preview")}</span>
          <div className="topbar-actions">
            <AppearanceButton />
            <nav className="language-switch" aria-label={t("nav.language")}>
              {["vi", "en"].map((language) => (
                <Link
                  key={language}
                  href={pathname.replace(/^\/(vi|en)/, `/${language}`)}
                  lang={language}
                  aria-current={language === locale ? "true" : undefined}
                >
                  {language.toUpperCase()}
                </Link>
              ))}
            </nav>
            {app.user ? (
              <Link className="account-button" href={`/${locale}/settings`}>
                {t("nav.account")}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ) : (
              <button className="account-button" onClick={app.openAuth}>
                {t("nav.signIn")}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>
        {!online && (
          <p className="connection-banner" role="status">
            {t("common.offline")}
          </p>
        )}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">{t("nav.footer")}</footer>
      </div>
      <nav className="mobile-nav" aria-label={t("nav.label")}>
        {links.slice(0, 4).map(([key, suffix, Icon]) => (
          <Link
            key={key}
            href={`/${locale}${suffix}`}
            aria-current={active(suffix) ? "page" : undefined}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{t(`nav.${key}`)}</span>
          </Link>
        ))}
        <button
          aria-haspopup="dialog"
          data-current={[
            "/downloads",
            "/mood",
            "/settings",
            "/admin",
            "/privacy",
            "/terms",
            "/credits",
          ].some(active)}
          aria-expanded={more}
          onClick={() => setMore(true)}
        >
          <MoreHorizontal size={21} aria-hidden="true" />
          <span>{t("common.more")}</span>
        </button>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title={t("common.more")}>
        <nav className="more-navigation" aria-label={t("nav.label")}>
          {links.slice(4).map(([key, suffix, Icon]) => (
            <Link
              key={key}
              href={`/${locale}${suffix}`}
              aria-current={active(suffix) ? "page" : undefined}
              onClick={() => setMore(false)}
            >
              <Icon size={21} aria-hidden="true" />
              {t(`nav.${key}`)}
            </Link>
          ))}
          {app.personal?.isAdmin && (
            <Link href={`/${locale}/admin`} onClick={() => setMore(false)}>
              {t("nav.admin")}
            </Link>
          )}
          {(["privacy", "terms", "credits"] as const).map((key) => (
            <Link key={key} href={`/${locale}/${key}`} onClick={() => setMore(false)}>
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
      </Dialog>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {app.notice}
      </div>
      {app.notice && (
        <div className="toast" aria-hidden="true">
          {app.notice}
        </div>
      )}
      {(app.progress || app.downloadError) && (
        <div className="download-status">
          {app.progress ? (
            <>
              <p role="status">
                {t("downloads.progress", {
                  title:
                    app.tracks.find((track) => track.id === app.progress?.id)?.title[
                      locale as Locale
                    ] ?? "",
                  percent: app.progress.percent,
                })}
              </p>
              <progress
                aria-label={t("downloads.downloadButton")}
                max={100}
                value={app.progress.percent}
              />
              <button className="text-button" onClick={app.cancelDownload}>
                {t("downloads.cancel")}
              </button>
            </>
          ) : (
            <p role="alert" className="error">
              {app.downloadError}
            </p>
          )}
        </div>
      )}
      <AuthDialog />
    </div>
  );
}
