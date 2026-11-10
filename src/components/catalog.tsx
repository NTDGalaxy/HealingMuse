"use client";
import { memo, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Play,
  Pause,
  Heart,
  Download,
  MoreHorizontal,
  ArrowUpRight,
  Check,
  Plus,
  AudioLines,
} from "lucide-react";
import {
  useAppActions,
  useDownloadState,
  useIsFavorite,
  usePersonalData,
  usePersonalError,
  useUserId,
} from "./app-state";
import { usePlayer } from "./player";
import { Artwork } from "./artwork";
import { useWashPreview } from "./wash";
import { Dialog } from "./dialog";
import { clock } from "@/lib/audio";
import type { CatalogPage, CatalogQuery, CuratedCollection, Locale, Track } from "@/lib/types";
import { CatalogControls } from "./catalog-controls";
import { primaryControl } from "@/lib/perf/readiness";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { ErrorState } from "./ui/error-state";
import { PageHeader } from "./ui/page-header";
import { Pagination } from "./ui/pagination";
import { SearchField } from "./ui/search-field";

/** The shared empty state under its earlier name, still imported by binaural-catalogue.tsx. */
export { EmptyState as Empty };
/** tile: artwork above its text; row: one list line; feature: the recording a view leads with. */
export type TrackCardLayout = "tile" | "row" | "feature";
// Memoised: a card re-renders only for its own favourite, download and sign-in state, never for
// download progress, notices or other recordings.
export const TrackCard = memo(function TrackCard({
  track,
  layout = "tile",
  queue,
  continuation,
  selection,
  primary = false,
}: {
  track: Track;
  layout?: TrackCardLayout;
  queue?: Track[];
  continuation?: CatalogQuery;
  selection?: { selected: boolean; choose: () => void; label: string; disabled?: boolean };
  /** Marks this card's play control as the route's primary control (readiness contract). */
  primary?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const actions = useAppActions();
  const player = usePlayer();
  const [details, setDetails] = useState(false);
  const [add, setAdd] = useState(false);
  const saved = useIsFavorite(track.id);
  const { downloaded, busy } = useDownloadState(track.id);
  const signedIn = useUserId() !== null;
  const title = track.title[locale];
  // The loaded recording wears the listening colour wherever it is listed, and its Play control
  // becomes Pause while it plays (and resumes it, not restarts it, while it is paused).
  const current = player.current?.id === track.id;
  const sounding = current && player.playing && !selection;
  const play =
    selection?.choose ??
    (() => (current ? void player.toggle() : player.play(track, queue, continuation)));
  const playButton = (
    <button
      className="card-play"
      data-part="track-play"
      {...primaryControl(primary && !selection)}
      aria-label={
        selection?.label ?? t(sounding ? "catalog.pauseTitle" : "catalog.playTitle", { title })
      }
      aria-pressed={selection ? selection.selected : undefined}
      disabled={selection?.disabled}
      onClick={play}
    >
      <span className="card-play-icon" aria-hidden="true">
        {selection ? (
          selection.selected ? (
            <Check size={22} />
          ) : (
            <Plus size={22} />
          )
        ) : sounding ? (
          <Pause size={layout === "row" ? 18 : 22} fill="currentColor" />
        ) : (
          <Play size={layout === "row" ? 18 : 22} fill="currentColor" />
        )}
      </span>
      {!selection && (
        <span className="card-play-label" data-part="track-play-label">
          {t(sounding ? "player.pause" : "common.play")}
        </span>
      )}
    </button>
  );
  const titleButton = (
    <button
      className="track-title"
      data-part="track-title"
      aria-label={selection?.label}
      aria-pressed={selection ? selection.selected : undefined}
      disabled={selection?.disabled}
      onClick={play}
    >
      {title}
    </button>
  );
  const duration = (
    <span className="duration">
      {current && <AudioLines size={16} aria-hidden="true" />}
      {clock(track.duration)}
    </span>
  );
  return (
    <article
      className={`track-card track-${layout}${selection?.selected ? " track-selected" : ""}`}
      data-part="track-card"
      data-current={current || undefined}
    >
      <div className="track-art" data-part="track-art">
        <Artwork track={track} />
        {layout !== "feature" && playButton}
        {downloaded && (
          <span className="downloaded-badge" title={t("catalog.downloaded")}>
            <Check size={16} aria-hidden="true" />
            <span className="sr-only">{t("catalog.downloaded")}</span>
          </span>
        )}
      </div>
      <div className="track-description" data-part="track-description">
        {layout === "feature" ? <h2 className="track-heading">{titleButton}</h2> : titleButton}
        <p data-part="track-artist">{track.artist}</p>
        {layout === "feature" && (
          <p className="track-meta">
            {duration}
            <span>{t(`catalog.${track.category}`)}</span>
          </p>
        )}
        <div className="track-bottom">
          {layout === "feature" ? playButton : duration}
          <div className="track-actions" data-part="track-actions">
            <button
              className="icon-button"
              aria-label={t(saved ? "catalog.unfavorite" : "catalog.favorite", { title })}
              aria-pressed={saved}
              onClick={() =>
                void actions.perform("/api/favorites", { trackId: track.id, saved: !saved })
              }
            >
              <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
            </button>
            {track.downloadAllowed && track.source.kind === "hosted" && (
              <button
                className="icon-button"
                data-action="download"
                aria-label={t("catalog.download", { title })}
                disabled={busy || downloaded}
                onClick={() => void actions.download(track)}
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
        {/* Every action a list line folds away on a phone stays reachable here. */}
        <div className="dialog-actions details-actions">
          <button
            className="button secondary"
            aria-pressed={saved}
            onClick={() =>
              void actions.perform("/api/favorites", { trackId: track.id, saved: !saved })
            }
          >
            <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
            {t(saved ? "catalog.unfavorite" : "catalog.favorite", { title })}
          </button>
          {track.downloadAllowed && track.source.kind === "hosted" && (
            <button
              className="button secondary"
              disabled={busy || downloaded}
              onClick={() => void actions.download(track)}
            >
              <Download size={18} aria-hidden="true" />
              {t(downloaded ? "catalog.downloaded" : "catalog.download", { title })}
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => {
              setDetails(false);
              if (!signedIn) actions.openAuth();
              else setAdd(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            {t("catalog.playlistAdd")}
          </button>
        </div>
      </Dialog>
      <Dialog open={add} onOpenChange={setAdd} title={t("library.addTitle")}>
        <PlaylistChoices track={track} close={() => setAdd(false)} />
      </Dialog>
    </article>
  );
});
/** Mounted only while the add-to-playlist dialog is shown, so closed cards ignore playlists. */
function PlaylistChoices({ track, close }: { track: Track; close: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const actions = useAppActions();
  const playlists = usePersonalData()?.playlists;
  const error = usePersonalError();
  return (
    <div className="form-stack">
      {playlists?.map((playlist) => (
        <button
          className="button secondary"
          key={playlist.id}
          disabled={playlist.trackIds.includes(track.id)}
          onClick={async () => {
            if (
              await actions.perform(
                `/api/playlists/${playlist.id}`,
                {
                  title: playlist.title,
                  revision: playlist.revision,
                  trackIds: [...playlist.trackIds, track.id],
                },
                "PATCH",
              )
            ) {
              close();
              actions.announce(t("library.added"));
            }
          }}
        >
          {playlist.title}
          {playlist.trackIds.includes(track.id) && <Check size={16} />}
        </button>
      ))}
      {!playlists?.length && (
        <Link className="button" href={`/${locale}/library`} onClick={close}>
          {t("library.newPlaylist")}
        </Link>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
const emptyCollections: CuratedCollection[] = [];
const emptyTracks: Track[] = [];
const emptyPage: CatalogPage = { items: [], total: 0, nextCursor: null };
export function CatalogUnavailable() {
  const t = useTranslations();
  const router = useRouter();
  return (
    <ErrorState
      message={t("catalog.unavailable")}
      action={
        <Button variant="secondary" onClick={() => router.refresh()}>
          {t("common.retry")}
        </Button>
      }
    />
  );
}
/** Home's large title, streamed before the catalogue so the first paint already names the page. */
export function HomeIntro() {
  const t = useTranslations();
  return (
    <header className="discovery-intro">
      <h1>{t("home.title")}</h1>
    </header>
  );
}
function HomeDiscovery() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  return (
    <div className="home-discovery">
      <SearchField
        id="home-search"
        className="discovery-search"
        iconSize={22}
        label={t("catalog.search")}
        placeholder={t("catalog.searchPlaceholder")}
        submitType="submit"
        action={`/${locale}/explore`}
        // The action stays for submissions before hydration. After it, search navigates on the
        // client: a document load would unmount the app and stop the persistent audio.
        onSubmit={(event) => {
          event.preventDefault();
          const query = new URLSearchParams();
          for (const [name, value] of new FormData(event.currentTarget))
            if (typeof value === "string") query.append(name, value);
          router.push(`/${locale}/explore?${query}`);
        }}
      />
      <nav className="discovery-categories" aria-label={t("catalog.genre")}>
        {["piano", "guitar", "strings"].map((value) => (
          <Link key={value} href={`/${locale}/explore?instrument=${value}`}>
            {t(`taxonomy.instrument.${value}`)}
          </Link>
        ))}
        <Link href={`/${locale}/explore?genre=classical`}>{t("taxonomy.genre.classical")}</Link>
        <Link href={`/${locale}/explore`}>
          {t("common.viewAll")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </div>
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
  const { registerTracks } = useAppActions();
  const tracks = initialPage.items;
  useEffect(() => {
    registerTracks([...tracks, ...collectionTracks]);
  }, [tracks, collectionTracks, registerTracks]);
  // While nothing plays, the wash wears the featured recording's colours.
  useWashPreview(unavailable ? null : (tracks[0] ?? null));
  const continuation = initialPage.nextCursor
    ? { limit: 12, cursor: initialPage.nextCursor }
    : undefined;
  return (
    <div className={withIntro ? "home-page" : "home-shelves"}>
      {withIntro && <HomeIntro />}
      {unavailable ? (
        <CatalogUnavailable />
      ) : (
        <section className="featured-section" aria-label={t("home.suggestion")}>
          <div className="featured-recording" data-part="featured-recording">
            {tracks.slice(0, 1).map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                layout="feature"
                queue={tracks}
                continuation={continuation}
                primary
              />
            ))}
          </div>
          {tracks.length > 1 && (
            <section
              className="home-more-recordings"
              data-part="more-recordings"
              aria-labelledby="home-up-next"
            >
              <h2 id="home-up-next">{t("home.upNext")}</h2>
              <div className="track-list">
                {tracks.slice(1, 4).map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    layout="row"
                    queue={tracks}
                    continuation={continuation}
                  />
                ))}
              </div>
            </section>
          )}
          {!tracks.length && <EmptyState title={t("common.emptyCatalog")} />}
        </section>
      )}
      <HomeDiscovery />
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
          <section className="collection-section" key={collection.id}>
            <div className="section-heading">
              <h2>{collection.title[locale]}</h2>
              <Link className="text-link" href={`/${locale}/explore?collection=${collection.id}`}>
                {t("common.viewAll")}
              </Link>
            </div>
            <div className="track-rail">
              {recordings.slice(0, 4).map((track) => (
                <TrackCard key={track.id} track={track} queue={recordings} />
              ))}
            </div>
          </section>
        );
      })}
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
  const { registerTracks } = useAppActions();
  const [pending, transition] = useTransition();
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
      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} />
      <CatalogControls query={query} navigate={navigate} />
      {unavailable ? (
        <CatalogUnavailable />
      ) : (
        <div aria-busy={pending}>
          <p className="results-note" role="status">
            {pending ? t("common.loading") : t("catalog.results", { count: initialPage.total })}
          </p>
          <div className="track-grid" data-result-key={JSON.stringify(query)}>
            {tracks.map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                queue={tracks}
                continuation={
                  initialPage.nextCursor ? { ...query, cursor: initialPage.nextCursor } : undefined
                }
                primary={index === 0}
              />
            ))}
          </div>
          {!tracks.length && (
            <EmptyState title={t("catalog.noResults")} text={t("catalog.noResultsText")}>
              <Button
                variant="secondary"
                onClick={() => transition(() => router.push(`/${locale}/explore`))}
              >
                {t("catalog.clear")}
              </Button>
            </EmptyState>
          )}
          <Pagination
            label={t("catalog.pages")}
            back={!!query.cursor && { label: t("common.back"), onClick: () => router.back() }}
            next={
              !!initialPage.nextCursor && {
                label: t("catalog.next"),
                // Unavailable while the page it opened loads, but focusable, so a keyboard
                // listener's focus stays on it instead of falling to the page.
                waiting: pending,
                onClick: () => navigate({ cursor: initialPage.nextCursor! }),
              }
            }
          />
        </div>
      )}
    </>
  );
}
