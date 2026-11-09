"use client";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/types";
import type { OnDemand } from "@/lib/on-demand";
import { decorationMayStart } from "@/lib/perf/audio-first";
import { markOnce, readinessMarks } from "@/lib/perf/readiness";
import {
  useAppActions,
  useDownloadError,
  useDownloadProgress,
  useNotice,
  useTrack,
} from "./app-state";

// Runtime pieces of the persistent Shell. Each subscribes to its own state, so a notice or a
// download chunk re-renders only the element that shows it.

/**
 * Scrolls keyboard focus inside the main content above the fixed overlays along the bottom edge
 * (the phone navigation and the player bar). Any element that can cover focused content there
 * carries a data-bottom-overlay attribute; hidden overlays (zero height) are ignored.
 */
export function BottomOverlayFocus() {
  useEffect(() => {
    const reveal = (event: FocusEvent) => {
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
      const overlays = [...document.querySelectorAll("[data-bottom-overlay]")]
        .map((overlay) => overlay.getBoundingClientRect())
        .filter((box) => box.height > 0);
      const bottom = Math.min(innerHeight, ...overlays.map((box) => box.top));
      const box = element.getBoundingClientRect();
      if (box.bottom > bottom - 16)
        window.scrollBy({ top: box.bottom - bottom + 24, behavior: "instant" });
    };
    document.addEventListener("focusin", reveal);
    return () => document.removeEventListener("focusin", reveal);
  }, []);
  return null;
}

/** Registers the offline shell worker once per visit. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* Online listening remains available. */
      });
  }, []);
  return null;
}

/** Announces notices politely to assistive technology and shows them as a toast. */
export function LiveAnnouncer() {
  const notice = useNotice();
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </div>
      {notice && (
        <div className="toast" aria-hidden="true">
          {notice}
        </div>
      )}
    </>
  );
}

/** Progress and cancel for the running download, or the last download error. */
export function DownloadStatus() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { cancelDownload } = useAppActions();
  const progress = useDownloadProgress();
  const error = useDownloadError();
  const track = useTrack(progress?.id);
  if (!progress && !error) return null;
  return (
    <div className="download-status">
      {progress ? (
        <>
          <p role="status">
            {t("downloads.progress", {
              title: track?.title[locale] ?? "",
              percent: progress.percent,
            })}
          </p>
          <progress aria-label={t("downloads.downloadButton")} max={100} value={progress.percent} />
          <button className="text-button" onClick={cancelDownload}>
            {t("downloads.cancel")}
          </button>
        </>
      ) : (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Downloads on-demand interface code while the page is idle, once the route is usable and any
 * first sound has started (decorationMayStart), so the queue, the sleep timer and other dialogs
 * still open after the connection drops, and preloading never competes with the first tap or
 * sound. Records hm:on-demand-ready once everything arrived; a failure just leaves each piece to
 * load, and retry, when it is opened.
 */
export function PreloadOnDemand({ modules }: { modules: readonly OnDemand<unknown>[] }) {
  useEffect(() => {
    const controller = new AbortController();
    let idle = 0;
    void decorationMayStart({ signal: controller.signal }).then((ready) => {
      if (!ready) return;
      const run = () =>
        void Promise.all(modules.map((module) => module.load())).then(
          () => markOnce(readinessMarks.onDemand),
          () => {},
        );
      if (typeof requestIdleCallback === "function")
        idle = requestIdleCallback(run, { timeout: 2000 });
      else idle = window.setTimeout(run, 0);
    });
    return () => {
      controller.abort();
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [modules]);
  return null;
}
