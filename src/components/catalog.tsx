"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Play,
  Heart,
  Download,
  MoreHorizontal,
  ArrowUpRight,
  Search,
  Leaf,
  Check,
  Plus,
} from "lucide-react";
import { useApp } from "./app-state";
import { usePlayer } from "./player";
import { NatureArt } from "./art";
import { Dialog } from "./dialog";
import { clock } from "@/lib/audio";
import type { CatalogPage, CatalogQuery, CuratedCollection, Locale, Track } from "@/lib/types";
import { taxonomy } from "@/lib/catalog-taxonomy";

export function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Leaf size={36} aria-hidden="true" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
export function TrackCard({
  track,
  compact = false,
  queue,
  continuation,
}: {
  track: Track;
  compact?: boolean;
  queue?: Track[];
  continuation?: CatalogQuery;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const player = usePlayer();
  const [details, setDetails] = useState(false);
  const [add, setAdd] = useState(false);
  const saved = app.personal?.favorites.includes(track.id) ?? false;
  const downloaded = app.downloaded.some((item) => item.id === track.id);
  const title = track.title[locale];
  return (
    <article className={`track-card ${compact ? "track-compact" : ""}`}>
      <div className="track-art">
        <NatureArt kind={track.artwork} color={track.color} />
        <span className="track-category">{t(`catalog.${track.category}`)}</span>
        <button
          className="card-play"
          aria-label={t("catalog.playTitle", { title })}
          onClick={() => player.play(track, queue, continuation)}
        >
          <Play size={22} fill="currentColor" aria-hidden="true" />
        </button>
        {downloaded && (
          <span className="downloaded-badge" title={t("catalog.downloaded")}>
            <Check size={16} aria-hidden="true" />
            <span className="sr-only">{t("catalog.downloaded")}</span>
          </span>
        )}
      </div>
      <div className="track-description">
        <button className="track-title" onClick={() => player.play(track, queue, continuation)}>
          {title}
        </button>
        <p>{track.artist}</p>
        <div className="track-bottom">
          <span className="duration">{clock(track.duration)}</span>
          <div className="track-actions">
            <button
              className="icon-button"
              aria-label={t(saved ? "catalog.unfavorite" : "catalog.favorite", { title })}
              aria-pressed={saved}
              onClick={() =>
                void app.perform("/api/favorites", { trackId: track.id, saved: !saved })
              }
            >
              <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
            </button>
            {track.downloadAllowed && track.source.kind === "hosted" && (
              <button
                className="icon-button"
                aria-label={t("catalog.download", { title })}
                disabled={!!app.progress || downloaded}
                onClick={() => void app.download(track)}
              >
                <Download size={18} aria-hidden="true" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={`${t("catalog.details")}: ${title}`}
              onClick={() => setDetails(true)}
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <Dialog
        open={details}
        onOpenChange={setDetails}
        title={title}
        description={track.description[locale]}
      >
        <p>{track.artist}</p>
        <h3>{t("catalog.credit")}</h3>
        <p className="credit-text">{track.attribution}</p>
        <p>
          <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer">
            {track.license}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </p>
        <p>
          <a href={track.provenanceUrl} target="_blank" rel="noopener noreferrer">
            {t("catalog.source")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </p>
        {track.changes && <p className="muted small">{track.changes}</p>}
        <button
          className="button secondary"
          onClick={() => {
            setDetails(false);
            if (!app.user) app.openAuth();
            else setAdd(true);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          {t("catalog.playlistAdd")}
        </button>
      </Dialog>
      <Dialog open={add} onOpenChange={setAdd} title={t("library.addTitle")}>
        <div className="form-stack">
          {app.personal?.playlists.map((playlist) => (
            <button
              className="button secondary"
              key={playlist.id}
              disabled={playlist.trackIds.includes(track.id)}
              onClick={async () => {
                if (
                  await app.perform(
                    `/api/playlists/${playlist.id}`,
                    {
                      title: playlist.title,
                      revision: playlist.revision,
                      trackIds: [...playlist.trackIds, track.id],
                    },
                    "PATCH",
                  )
                ) {
                  setAdd(false);
                  app.announce(t("library.added"));
                }
              }}
            >
              {playlist.title}
              {playlist.trackIds.includes(track.id) && <Check size={16} />}
            </button>
          ))}
          {!app.personal?.playlists.length && (
            <Link className="button" href={`/${locale}/library`} onClick={() => setAdd(false)}>
              {t("library.newPlaylist")}
            </Link>
          )}
          {app.error && (
            <p role="alert" className="error">
              {app.error}
            </p>
          )}
        </div>
      </Dialog>
    </article>
  );
}
const emptyCollections: CuratedCollection[] = [];
const emptyTracks: Track[] = [];
const emptyPage: CatalogPage = { items: [], total: 0, nextCursor: null };
export function CatalogUnavailable() {
  const t = useTranslations();
  const router = useRouter();
  return (
    <div className="info-panel" role="alert">
      <p>{t("catalog.unavailable")}</p>
      <button className="button secondary" onClick={() => router.refresh()}>
        {t("common.retry")}
      </button>
    </div>
  );
}
export function HomeIntro() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <>
      <section className="discovery-intro">
        <div>
          <h1>{t("home.title")}</h1>
          <p>{t("home.subtitle")}</p>
        </div>
        <Link className="text-link" href={`/${locale}/explore`}>
          {t("home.secondary")}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </section>
      <form className="search-box discovery-search" action={`/${locale}/explore`}>
        <Search size={22} aria-hidden="true" />
        <label className="sr-only" htmlFor="home-search">
          {t("catalog.search")}
        </label>
        <input
          id="home-search"
          name="q"
          type="search"
          maxLength={120}
          placeholder={t("catalog.searchPlaceholder")}
        />
        <button className="button" type="submit">
          {t("catalog.search")}
        </button>
      </form>
      <nav className="discovery-categories" aria-label={t("catalog.genre")}>
        {["piano", "guitar", "strings"].map((value) => (
          <Link key={value} href={`/${locale}/explore?instrument=${value}`}>
            {t(`taxonomy.instrument.${value}`)}
          </Link>
        ))}
        <Link href={`/${locale}/explore?genre=classical`}>{t("taxonomy.genre.classical")}</Link>
        <Link href={`/${locale}/explore?category=nature`}>{t("catalog.nature")}</Link>
        <Link href={`/${locale}/explore`}>
          {t("common.viewAll")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </>
  );
}
export function HomeView({
  initialPage = emptyPage,
  initialCollections = emptyCollections,
  collectionTracks = emptyTracks,
  unavailable = false,
  withIntro = true,
}: {
  initialPage?: CatalogPage;
  initialCollections?: CuratedCollection[];
  collectionTracks?: Track[];
  unavailable?: boolean;
  withIntro?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { registerTracks } = useApp();
  const player = usePlayer();
  const tracks = initialPage.items;
  useEffect(() => {
    registerTracks([...tracks, ...collectionTracks]);
  }, [tracks, collectionTracks, registerTracks]);
  return (
    <div className={withIntro ? "home-page" : "home-shelves"}>
      {withIntro && <HomeIntro />}
      {unavailable ? (
        <CatalogUnavailable />
      ) : (
        <section>
          <div className="section-heading">
            <div>
              <h2>{t("home.featured")}</h2>
              <p>{t("home.featuredNote")}</p>
            </div>
            <button
              className="button secondary home-listen"
              disabled={!tracks.length}
              onClick={() =>
                tracks[0] &&
                player.play(tracks[0], tracks, { limit: 12, cursor: initialPage.nextCursor || "" })
              }
            >
              <Play size={18} aria-hidden="true" />
              {t("home.cta")}
            </button>
          </div>
          <div className="track-grid">
            {tracks.slice(0, 4).map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                queue={tracks}
                continuation={
                  initialPage.nextCursor ? { limit: 12, cursor: initialPage.nextCursor } : undefined
                }
              />
            ))}
          </div>
          {!tracks.length && <Empty title={t("common.emptyCatalog")} />}
        </section>
      )}
      <section className="listening-paths">
        <h2>{t("home.today")}</h2>
        <div className="filter-row">
          {["relax", "rest", "focus"].map((goal) => (
            <Link className="filter-chip" key={goal} href={`/${locale}/explore?goal=${goal}`}>
              {t(`goals.${goal}`)}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      {initialCollections.map((collection) => {
        const recordings = collection.trackIds.flatMap(
          (id) => collectionTracks.find((track) => track.id === id) || [],
        );
        return (
          <section key={collection.id}>
            <div className="section-heading">
              <h2>{collection.title[locale]}</h2>
              <Link className="text-link" href={`/${locale}/explore?collection=${collection.id}`}>
                {t("common.viewAll")}
              </Link>
            </div>
            <div className="track-grid">
              {recordings.slice(0, 4).map((track) => (
                <TrackCard key={track.id} track={track} queue={recordings} />
              ))}
            </div>
          </section>
        );
      })}
      <section className="nature-banner">
        <NatureArt kind="river" />
        <div>
          <h2>{t("home.natureTitle")}</h2>
          <p>{t("home.natureText")}</p>
          <Link className="text-link" href={`/${locale}/explore?category=nature`}>
            {t("home.natureCta")}
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <p className="trust-note">
        {t("home.curated")} · {t("home.private")} · {t("home.atYourPace")}
      </p>
    </div>
  );
}
export function ExploreView({
  initialPage = emptyPage,
  query = {},
  unavailable = false,
}: {
  initialPage?: CatalogPage;
  query?: CatalogQuery;
  unavailable?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { registerTracks } = useApp();
  const [pending, transition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(query.goal || query.genre || query.instrument || query.tradition),
  );
  const tracks = initialPage.items;
  useEffect(() => registerTracks(tracks), [tracks, registerTracks]);
  const navigate = (patch: Partial<CatalogQuery>) => {
    const next = { ...query, cursor: "", ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next))
      if (value && key !== "status") params.set(key, String(value));
    transition(() => router.push(`/${locale}/explore?${params}`));
  };
  return (
    <>
      <PageHeading title={t("catalog.title")} subtitle={t("catalog.subtitle")} />
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: String(new FormData(event.currentTarget).get("q") || "") });
        }}
      >
        <Search size={21} aria-hidden="true" />
        <label htmlFor="catalog-search" className="sr-only">
          {t("catalog.search")}
        </label>
        <input
          key={query.q}
          id="catalog-search"
          name="q"
          type="search"
          defaultValue={query.q || ""}
          maxLength={120}
          placeholder={t("catalog.searchPlaceholder")}
        />
        <button className="button">{t("catalog.search")}</button>
      </form>
      <div className="filter-row" aria-label={t("catalog.title")}>
        {["", "instrumental", "nature"].map((value) => (
          <button
            className="filter-chip"
            key={value}
            aria-pressed={(query.category || "") === value}
            onClick={() => navigate({ category: value })}
          >
            {t(value ? `catalog.${value}` : "common.all")}
          </button>
        ))}
      </div>
      <details
        className="catalog-filter-details"
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>{t("catalog.filters")}</summary>
        <div className="catalog-facets">
          {(["goal", "genre", "instrument", "tradition"] as const).map((field) => (
            <label key={field} htmlFor={`filter-${field}`}>
              {t(field === "goal" ? "home.today" : `catalog.${field}`)}
              <select
                id={`filter-${field}`}
                value={query[field] || ""}
                onChange={(event) => navigate({ [field]: event.target.value })}
              >
                <option value="">{t("common.all")}</option>
                {(field === "goal" ? ["relax", "rest", "focus"] : taxonomy[field]).map((value) => (
                  <option key={value} value={value}>
                    {t(field === "goal" ? `goals.${value}` : `taxonomy.${field}.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      {unavailable ? (
        <CatalogUnavailable />
      ) : (
        <div aria-busy={pending}>
          <p className="results-note" role="status">
            {pending ? t("common.loading") : t("catalog.results", { count: initialPage.total })}
          </p>
          <div className="track-grid">
            {tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                queue={tracks}
                continuation={
                  initialPage.nextCursor ? { ...query, cursor: initialPage.nextCursor } : undefined
                }
              />
            ))}
          </div>
          {!tracks.length && (
            <Empty title={t("catalog.noResults")} text={t("catalog.noResultsText")}>
              <button
                className="button secondary"
                onClick={() => transition(() => router.push(`/${locale}/explore`))}
              >
                {t("catalog.clear")}
              </button>
            </Empty>
          )}
          <nav className="catalog-pagination" aria-label={t("catalog.pages")}>
            {query.cursor && (
              <button className="button secondary" onClick={() => router.back()}>
                {t("common.back")}
              </button>
            )}
            {initialPage.nextCursor && (
              <button
                className="button"
                disabled={pending}
                onClick={() => navigate({ cursor: initialPage.nextCursor! })}
              >
                {t("catalog.next")}
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
