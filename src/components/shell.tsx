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
  ShieldCheck,
  Headphones,
  MoreHorizontal,
} from "lucide-react";
import { useCalm, useIsAdmin, useOnline } from "./app-state";
import { AuthDialogOnDemand, authDialogCode } from "@/features/account/auth-dialog-on-demand";
import { Scenery } from "./scenery";
import { WashProvider } from "./wash";
import { isConfigured } from "@/lib/supabase/config";
import { Fragment, useLayoutEffect, useState } from "react";
import { markOnce, readinessMarks } from "@/lib/perf/readiness";
import { AppearanceButton } from "./appearance";
import { Dialog, dialogCode } from "./dialog";
import {
  AccountButton,
  BottomOverlayFocus,
  DownloadStatus,
  LiveAnnouncer,
  PreloadOnDemand,
  ServiceWorkerRegistration,
} from "./shell-runtime";
import type { Locale } from "@/lib/types";
import {
  isRouteActive,
  localizedPath,
  locales,
  routeHref,
  routesIn,
  type RouteKey,
} from "@/lib/routes";

// Interface code the Shell fetches while idle once listening has begun, so it still opens offline.
const onDemandCode = [dialogCode, authDialogCode];

const icons: Partial<Record<RouteKey, typeof House>> = {
  home: House,
  explore: Compass,
  binaural: Headphones,
  library: Library,
  downloads: Download,
  mood: Heart,
  settings: Settings,
};
const primaryRoutes = routesIn("primary");
const secondaryRoutes = routesIn("more");
const legalRoutes = routesIn("legal");
const moreRoutes = routesIn("more", "admin", "legal");
export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const calm = useCalm();
  const isAdmin = useIsAdmin();
  const online = useOnline();
  const [more, setMore] = useState(false);
  // Readiness contract: navigation is hydrated and usable from this commit on.
  useLayoutEffect(() => markOnce(readinessMarks.shell), []);
  const active = (key: RouteKey) => isRouteActive(pathname, locale as Locale, key);
  const href = (key: RouteKey) => routeHref(locale as Locale, key);
  return (
    <div className={`app-shell ${calm ? "calm-mode" : ""}`} data-part="app-shell">
      <Scenery pathname={pathname} />
      <WashProvider>
        <a className="skip-link" href="#main-content">
          {t("nav.skip")}
        </a>
        <aside className="sidebar" data-part="sidebar">
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
            {[...primaryRoutes, ...secondaryRoutes].map(({ key }) => {
              const Icon = icons[key]!;
              return (
                <Link key={key} href={href(key)} aria-current={active(key) ? "page" : undefined}>
                  <Icon size={21} aria-hidden="true" />
                  <span>{t(`nav.${key}`)}</span>
                </Link>
              );
            })}
            {isAdmin && (
              <Link href={href("admin")} aria-current={active("admin") ? "page" : undefined}>
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
            {legalRoutes.map(({ key }, index) => (
              <Fragment key={key}>
                {index === 1 && <span>·</span>}
                <Link href={href(key)}>{t(`nav.${key}`)}</Link>
              </Fragment>
            ))}
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <Link href={`/${locale}`} className="mobile-brand">
              <Leaf size={22} aria-hidden="true" />
              HealingMuse
            </Link>
            <span className="topbar-welcome">
              {t(isConfigured ? "home.welcome" : "nav.preview")}
            </span>
            <div className="topbar-actions">
              <AppearanceButton />
              <nav className="language-switch" aria-label={t("nav.language")}>
                {locales.map((language) => (
                  <Link
                    key={language}
                    href={localizedPath(pathname, language)}
                    lang={language}
                    aria-current={language === locale ? "true" : undefined}
                  >
                    {language.toUpperCase()}
                  </Link>
                ))}
              </nav>
              <AccountButton />
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
        <nav
          className="mobile-nav"
          data-part="mobile-nav"
          data-bottom-overlay=""
          aria-label={t("nav.label")}
        >
          {primaryRoutes.map(({ key }) => {
            const Icon = icons[key]!;
            return (
              <Link key={key} href={href(key)} aria-current={active(key) ? "page" : undefined}>
                <Icon size={21} aria-hidden="true" />
                <span>{t(`nav.${key}`)}</span>
              </Link>
            );
          })}
          <button
            aria-haspopup="dialog"
            data-current={moreRoutes.some(({ key }) => active(key))}
            aria-expanded={more}
            onClick={() => setMore(true)}
          >
            <MoreHorizontal size={21} aria-hidden="true" />
            <span>{t("common.more")}</span>
          </button>
        </nav>
        <Dialog open={more} onOpenChange={setMore} title={t("common.more")}>
          <nav className="more-navigation" aria-label={t("nav.label")}>
            {secondaryRoutes.map(({ key }) => {
              const Icon = icons[key]!;
              return (
                <Link
                  key={key}
                  href={href(key)}
                  aria-current={active(key) ? "page" : undefined}
                  onClick={() => setMore(false)}
                >
                  <Icon size={21} aria-hidden="true" />
                  {t(`nav.${key}`)}
                </Link>
              );
            })}
            {isAdmin && (
              <Link href={href("admin")} onClick={() => setMore(false)}>
                {t("nav.admin")}
              </Link>
            )}
            {legalRoutes.map(({ key }) => (
              <Link key={key} href={href(key)} onClick={() => setMore(false)}>
                {t(`nav.${key}`)}
              </Link>
            ))}
          </nav>
        </Dialog>
        <LiveAnnouncer />
        <DownloadStatus />
        <AuthDialogOnDemand />
        <BottomOverlayFocus />
        <ServiceWorkerRegistration />
        <PreloadOnDemand modules={onDemandCode} />
      </WashProvider>
    </div>
  );
}
