"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Play, Download } from "lucide-react";
import { useAppActions, useOnline, usePersonalData, useTrackLookup } from "@/components/app-state";
import { TrackCard } from "@/components/catalog";
import { usePlayer } from "@/components/player";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import type { Playlist, Track } from "@/lib/types";
import { api } from "@/lib/browser/api";
import { AccountGate } from "@/features/account/account-gate";
import { CreatePlaylistDialog, EditPlaylistDialog } from "./playlist-dialogs";

const favoritesPerPage = 24;

export function LibraryView() {
  const t = useTranslations();
  const actions = useAppActions();
  const personal = usePersonalData();
  const tracks = useTrackLookup();
  const player = usePlayer();
  const online = useOnline();
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [edit, setEdit] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [favoritePage, setFavoritePage] = useState(0);
  const editingIds = edit?.trackIds;
  const { ensureTracks, announce } = actions;
  const favoriteIds = personal?.favorites;
  const playlists = personal?.playlists;
  useEffect(() => {
    const ids = [
      ...(favoriteIds || []).slice(
        favoritePage * favoritesPerPage,
        (favoritePage + 1) * favoritesPerPage,
      ),
      ...(playlists || []).flatMap((playlist) => playlist.trackIds.slice(0, 1)),
      ...(editingIds || []),
    ];
    if (online && ids.length) void ensureTracks(ids).catch(() => announce(t("errors.unavailable")));
  }, [favoriteIds, playlists, editingIds, favoritePage, ensureTracks, online, announce, t]);
  // Stable while nothing it reads changes, so the memoised cards below can skip renders.
  const favorites = useMemo(
    () =>
      (favoriteIds || [])
        .slice(favoritePage * favoritesPerPage, (favoritePage + 1) * favoritesPerPage)
        .flatMap((id) => tracks.get(id) || []),
    [favoriteIds, favoritePage, tracks],
  );
  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.subtitle")} />
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
            <EmptyState
              title={t("library.emptyFavorites")}
              text={t("library.emptyFavoritesText")}
            />
          )}
          <Pagination
            back={
              favoritePage > 0 && {
                label: t("common.back"),
                onClick: () => setFavoritePage(favoritePage - 1),
              }
            }
            next={
              (favoriteIds?.length || 0) > (favoritePage + 1) * favoritesPerPage && {
                label: t("catalog.next"),
                onClick: () => setFavoritePage(favoritePage + 1),
              }
            }
            nextVariant="secondary"
          />
        </section>
        <section>
          <div className="section-heading">
            <h2>{t("library.playlists")}</h2>
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setTitle("");
                setCreate(true);
              }}
            >
              <Plus size={18} />
              {t("library.newPlaylist")}
            </Button>
          </div>
          <div className="playlist-grid">
            {personal?.playlists.map((playlist) => {
              const recordings = playlist.trackIds.flatMap((id) => tracks.get(id) ?? []);
              return (
                <article className="panel playlist-panel" key={playlist.id}>
                  <span className="playlist-icon">
                    <Download size={23} aria-hidden="true" />
                  </span>
                  <h3>{playlist.title}</h3>
                  <p className="muted">{t("common.tracks", { count: playlist.trackIds.length })}</p>
                  <div className="dialog-actions">
                    <Button
                      aria-label={`${t("library.listenPlaylist")}: ${playlist.title}`}
                      disabled={!playlist.trackIds.length}
                      onClick={async () => {
                        try {
                          const ordered =
                            recordings.length === playlist.trackIds.length
                              ? recordings
                              : await api<Track[]>(
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
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => {
                        actions.clearError();
                        setEdit({ ...playlist, trackIds: [...playlist.trackIds] });
                      }}
                    >
                      {t("library.editPlaylist")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {!personal?.playlists.length && <p className="muted">{t("library.emptyPlaylists")}</p>}
        </section>
      </AccountGate>
      <CreatePlaylistDialog
        open={create}
        onOpenChange={setCreate}
        title={title}
        onTitleChange={setTitle}
      />
      <EditPlaylistDialog
        playlist={edit}
        onChange={setEdit}
        onDelete={(playlist) => {
          setDeleting(playlist);
          setEdit(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title={t("library.deleteTitle")}
        description={t("library.deleteText")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (deleting && (await actions.perform(`/api/playlists/${deleting.id}`, {}, "DELETE")))
            setDeleting(null);
        }}
      />
    </>
  );
}
