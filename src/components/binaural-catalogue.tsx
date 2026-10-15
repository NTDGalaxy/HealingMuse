"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/browser/api";
import { catalogMatcher } from "@/lib/catalog-match";
import type { CatalogPage, CatalogQuery, Locale } from "@/lib/types";
import { CatalogControls } from "./catalog-controls";
import { Empty, TrackCard } from "./catalog";
import { useApp, useOnline } from "./app-state";
import { useBinaural } from "./binaural-provider";

const pageSize = 24;
export function BinauralCatalogue({ initial }: { initial: CatalogPage }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const session = useBinaural();
  const online = useOnline();
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState<CatalogQuery>({ limit: pageSize });
  const queryRef = useRef(query);
  const [history, setHistory] = useState<string[]>([]);
  const historyRef = useRef(history);
  const [localPage, setLocalPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(initial.total > 0);
  const [error, setError] = useState(false);
  const opened = useRef(initial.total > 0);
  const section = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const { registerTracks, ensureTracks } = app;
  useEffect(() => registerTracks(page.items), [page.items, registerTracks]);
  useEffect(() => {
    if (session.backgroundId) void ensureTracks([session.backgroundId]);
  }, [session.backgroundId, ensureTracks]);
  const load = useCallback(async (next: CatalogQuery, cursors: string[]) => {
    opened.current = true;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    queryRef.current = next;
    historyRef.current = cursors;
    setQuery(next);
    setHistory(cursors);
    setError(false);
    setLocalPage(0);
    if (!navigator.onLine) {
      setBusy(false);
      setLoaded(true);
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next))
        if (value && key !== "status") params.set(key, String(value));
      const result = await api<CatalogPage>(`/api/catalog?${params}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setPage(result);
        setLoaded(true);
      }
    } catch {
      if (!controller.signal.aborted) {
        setError(true);
        setLoaded(true);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (opened.current || !section.current) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => void load(queryRef.current, []));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (!opened.current) void load(queryRef.current, []);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [load]);
  useEffect(() => {
    const reconnect = () => {
      if (opened.current) void load({ ...queryRef.current, cursor: "" }, []);
    };
    const disconnect = () => {
      request.current?.abort();
      setBusy(false);
      setLocalPage(0);
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      request.current?.abort();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, [load]);
  const navigate = (patch: Partial<CatalogQuery>) =>
    void load({ ...queryRef.current, cursor: "", ...patch }, []);
  const localMode = !online || error;
  const localTracks = useMemo(
    () => app.downloaded.map((item) => item.track).filter(catalogMatcher(query)),
    [app.downloaded, query],
  );
  const localOffset =
    Math.min(localPage, Math.max(0, Math.ceil(localTracks.length / pageSize) - 1)) * pageSize;
  const visible = localMode
    ? { items: localTracks.slice(localOffset, localOffset + pageSize), total: localTracks.length }
    : page;
  const offset = localMode ? localOffset : history.length * pageSize;
  const selected =
    app.tracks.find((track) => track.id === session.backgroundId) ??
    app.downloaded.find((item) => item.id === session.backgroundId)?.track;
  return (
    <section
      ref={section}
      className="binaural-background reading-surface"
      aria-labelledby="binaural-catalogue-heading"
    >
      <h2 id="binaural-catalogue-heading">{t("binaural.backgroundTitle")}</h2>
      {session.backgroundId && (
        <p className="binaural-catalogue-selection">
          {selected?.title[locale] ?? t("binaural.backgroundUnavailable")}
        </p>
      )}
      <p className="muted small">{t("binaural.backgroundHint")}</p>
      <button
        className="filter-chip binaural-tones-only"
        type="button"
        aria-pressed={session.backgroundId === null}
        onClick={() => session.chooseBackground(null)}
      >
        {t("binaural.none")}
      </button>
      <CatalogControls id="binaural" query={query} navigate={navigate} />
      {error && (
        <div className="info-panel" role="alert">
          <p>{t("catalog.unavailable")}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => void load(queryRef.current, historyRef.current)}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {localMode && <p className="small muted">{t("binaural.offlineCatalogue")}</p>}
      <p className="results-note" role="status">
        {busy || (!loaded && !localMode)
          ? t("common.loading")
          : t("catalog.results", { count: visible.total })}
      </p>
      <fieldset disabled={busy} aria-busy={busy} className="binaural-tracks">
        <legend className="sr-only">{t("binaural.chooseMusic")}</legend>
        <div
          className="track-grid"
          data-result-key={JSON.stringify([query, offset, busy, localMode])}
        >
          {visible.items.map((track) => (
            <div key={track.id} className="binaural-recording">
              <TrackCard
                track={track}
                selection={{
                  selected: session.backgroundId === track.id,
                  choose: () => {
                    registerTracks([track]);
                    session.chooseBackground(track.id);
                  },
                  label: t("binaural.useBackground", { title: track.title[locale] }),
                  disabled: track.source.kind !== "hosted",
                }}
              />
              {track.source.kind !== "hosted" && (
                <p className="small muted">{t("binaural.mixUnsupported")}</p>
              )}
              {session.backgroundId === track.id && (
                <a className="button secondary binaural-return" href="#binaural-player-heading">
                  {t("binaural.returnToSession")}
                </a>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      {!busy && (loaded || localMode) && !visible.items.length && (
        <Empty title={t("catalog.noResults")} text={t("catalog.noResultsText")}>
          <button
            className="button secondary"
            type="button"
            onClick={() => void load({ limit: pageSize }, [])}
          >
            {t("catalog.clear")}
          </button>
        </Empty>
      )}
      {visible.total > 0 && (
        <p className="small muted binaural-range">
          {t("binaural.pageRange", {
            start: offset + 1,
            end: offset + visible.items.length,
            total: visible.total,
          })}
        </p>
      )}
      <nav className="catalog-pagination" aria-label={t("catalog.pages")}>
        {(localMode ? localOffset > 0 : history.length > 0) && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              localMode
                ? setLocalPage((value) => Math.max(0, value - 1))
                : void load({ ...queryRef.current, cursor: history.at(-1)! }, history.slice(0, -1))
            }
          >
            {t("common.back")}
          </button>
        )}
        {(localMode ? localOffset + pageSize < localTracks.length : page.nextCursor) && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              localMode
                ? setLocalPage((value) => value + 1)
                : void load({ ...queryRef.current, cursor: page.nextCursor! }, [
                    ...history,
                    queryRef.current.cursor || "",
                  ])
            }
          >
            {t("catalog.next")}
          </button>
        )}
      </nav>
      <p className="small muted">
        {t("binaural.licensing")} <Link href={`/${locale}/credits`}>{t("binaural.credits")}</Link>
      </p>
    </section>
  );
}
