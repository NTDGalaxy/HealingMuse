"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2, Plus, Play, Download } from "lucide-react";
import {
  useAppActions,
  useOnline,
  usePersonalData,
  usePersonalError,
  useTrackLookup,
} from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Empty, PageHeading, TrackCard } from "@/components/catalog";
import { usePlayer } from "@/components/player";
import type { Locale, Playlist } from "@/lib/types";
import { api } from "@/lib/browser/api";
import { AccountGate } from "@/features/account/account-gate";

export function LibraryView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const actions = useAppActions();
  const personal = usePersonalData();
  const tracks = useTrackLookup();
  const error = usePersonalError();
  const player = usePlayer();
  const online = useOnline();
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [edit, setEdit] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [busy, setBusy] = useState(false);
  const [favoritePage, setFavoritePage] = useState(0);
  const editingIds = edit?.trackIds;
  const { ensureTracks, announce } = actions;
  const favoriteIds = personal?.favorites;
  const playlists = personal?.playlists;
  useEffect(() => {
    const ids = [
      ...(favoriteIds || []).slice(favoritePage * 24, (favoritePage + 1) * 24),
      ...(playlists || []).flatMap((playlist) => playlist.trackIds.slice(0, 1)),
      ...(editingIds || []),
    ];
    if (online && ids.length) void ensureTracks(ids).catch(() => announce(t("errors.unavailable")));
  }, [favoriteIds, playlists, editingIds, favoritePage, ensureTracks, online, announce, t]);
  // Stable while nothing it reads changes, so the memoised cards below can skip renders.
  const favorites = useMemo(
    () =>
      (favoriteIds || [])
        .slice(favoritePage * 24, (favoritePage + 1) * 24)
        .flatMap((id) => tracks.get(id) || []),
    [favoriteIds, favoritePage, tracks],
  );
  return (
    <>
      <PageHeading title={t("library.title")} subtitle={t("library.subtitle")} />
      <AccountGate>
        <section>
          <div className="section-heading">
            <h2>{t("library.favorites")}</h2>
          </div>
          {favorites.length ? (
            <div className="track-grid">
              {favorites.map((track) => (
                <TrackCard key={track.id} track={track} queue={favorites} />
              ))}
            </div>
          ) : (
            <Empty title={t("library.emptyFavorites")} text={t("library.emptyFavoritesText")} />
          )}
          <div className="catalog-pagination">
            {favoritePage > 0 && (
              <button
                className="button secondary"
                onClick={() => setFavoritePage(favoritePage - 1)}
              >
                {t("common.back")}
              </button>
            )}
            {(favoriteIds?.length || 0) > (favoritePage + 1) * 24 && (
              <button
                className="button secondary"
                onClick={() => setFavoritePage(favoritePage + 1)}
              >
                {t("catalog.next")}
              </button>
            )}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>{t("library.playlists")}</h2>
            <button
              className="button secondary"
              disabled={!online}
              onClick={() => {
                setTitle("");
                setCreate(true);
              }}
            >
              <Plus size={18} />
              {t("library.newPlaylist")}
            </button>
          </div>
          <div className="playlist-grid">
            {personal?.playlists.map((playlist) => {
              const recordings = playlist.trackIds.flatMap((id) => tracks.get(id) ?? []);
              return (
                <article className="panel playlist-panel" key={playlist.id}>
                  <span className="playlist-icon">
                    <LeafIcon />
                  </span>
                  <h3>{playlist.title}</h3>
                  <p className="muted">{t("common.tracks", { count: playlist.trackIds.length })}</p>
                  <div className="dialog-actions">
                    <button
                      className="button"
                      aria-label={`${t("library.listenPlaylist")}: ${playlist.title}`}
                      disabled={!playlist.trackIds.length}
                      onClick={async () => {
                        try {
                          const ordered =
                            recordings.length === playlist.trackIds.length
                              ? recordings
                              : await api<import("@/lib/types").Track[]>(
                                  `/api/tracks?ids=${playlist.trackIds.join(",")}`,
                                );
                          if (ordered.length) player.play(ordered[0], ordered);
                          else announce(t("common.emptyCatalog"));
                        } catch {
                          announce(t("errors.unavailable"));
                        }
                      }}
                    >
                      <Play size={17} />
                      {t("common.play")}
                    </button>
                    <button
                      className="button secondary"
                      disabled={!online}
                      onClick={() => {
                        actions.clearError();
                        setEdit({ ...playlist, trackIds: [...playlist.trackIds] });
                      }}
                    >
                      {t("library.editPlaylist")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!personal?.playlists.length && <p className="muted">{t("library.emptyPlaylists")}</p>}
        </section>
      </AccountGate>
      <Dialog open={create} onOpenChange={setCreate} title={t("library.newPlaylist")}>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await actions.perform("/api/playlists", { title })) setCreate(false);
            setBusy(false);
          }}
        >
          <label htmlFor="playlist-name">{t("library.playlistTitle")}</label>
          <input
            id="playlist-name"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("library.placeholder")}
          />
          <button className="button" disabled={busy || !online}>
            {t("common.save")}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={() => setEdit(null)}
        title={t("library.editPlaylist")}
        description={t("library.editNote")}
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!edit) return;
            setBusy(true);
            if (
              await actions.perform(
                `/api/playlists/${edit.id}`,
                { title: edit.title, revision: edit.revision, trackIds: edit.trackIds },
                "PATCH",
              )
            )
              setEdit(null);
            else {
              const latest = await actions.refresh();
              const fresh = latest?.playlists.find((item) => item.id === edit.id);
              if (fresh && fresh.revision !== edit.revision)
                setEdit({ ...fresh, trackIds: [...fresh.trackIds] });
            }
            setBusy(false);
          }}
        >
          <label htmlFor="edit-playlist-name">{t("library.playlistTitle")}</label>
          <input
            id="edit-playlist-name"
            required
            maxLength={100}
            value={edit?.title ?? ""}
            onChange={(e) => edit && setEdit({ ...edit, title: e.target.value })}
          />
          <ol className="edit-list">
            {edit?.trackIds.map((id, index) => {
              const name = tracks.get(id)?.title[locale] ?? id;
              const move = (offset: number) => {
                if (!edit) return;
                const ids = [...edit.trackIds];
                [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
                setEdit({ ...edit, trackIds: ids });
              };
              return (
                <li key={id}>
                  <span>{name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === 0}
                    aria-label={t("library.moveUp", { title: name })}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === edit.trackIds.length - 1}
                    aria-label={t("library.moveDown", { title: name })}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${t("common.remove")}: ${name}`}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        trackIds: edit.trackIds.filter((trackId) => trackId !== id),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </li>
              );
            })}
          </ol>
          {!edit?.trackIds.length && <p>{t("library.noPlaylistTracks")}</p>}
          <div className="dialog-actions">
            <button className="button" disabled={busy || !online}>
              {t("common.save")}
            </button>
            <button
              type="button"
              className="button danger secondary"
              onClick={() => {
                setDeleting(edit);
                setEdit(null);
              }}
            >
              {t("common.delete")}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title={t("library.deleteTitle")}
        description={t("library.deleteText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            if (deleting && (await actions.perform(`/api/playlists/${deleting.id}`, {}, "DELETE")))
              setDeleting(null);
          }}
        >
          {t("common.delete")}
        </button>
      </Dialog>
    </>
  );
}
function LeafIcon() {
  return <Download size={23} aria-hidden="true" />;
}
