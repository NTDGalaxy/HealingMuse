"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAppActions, useOnline, usePersonalError, useTrackLookup } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ReorderableList } from "@/components/ui/reorderable-list";
import type { Locale, Playlist } from "@/lib/types";

/** Names and creates an empty playlist; the library owns the title so it can reset it. */
export function CreatePlaylistDialog({
  open,
  onOpenChange,
  title,
  onTitleChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onTitleChange: (title: string) => void;
}) {
  const t = useTranslations();
  const actions = useAppActions();
  const online = useOnline();
  const error = usePersonalError();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("library.newPlaylist")}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          if (await actions.perform("/api/playlists", { title })) onOpenChange(false);
          setBusy(false);
        }}
      >
        <TextField
          id="playlist-name"
          label={t("library.playlistTitle")}
          required
          maxLength={100}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t("library.placeholder")}
        />
        <Button disabled={busy || !online}>{t("common.save")}</Button>
        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

/**
 * Renames, reorders and trims a copy of a playlist. A save that lost to another device's change
 * reloads the latest revision into the dialog instead of overwriting it.
 */
export function EditPlaylistDialog({
  playlist,
  onChange,
  onDelete,
}: {
  playlist: Playlist | null;
  onChange: (playlist: Playlist | null) => void;
  onDelete: (playlist: Playlist) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const actions = useAppActions();
  const tracks = useTrackLookup();
  const online = useOnline();
  const error = usePersonalError();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={!!playlist}
      onOpenChange={() => onChange(null)}
      title={t("library.editPlaylist")}
      description={t("library.editNote")}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!playlist) return;
          setBusy(true);
          if (
            await actions.perform(
              `/api/playlists/${playlist.id}`,
              { title: playlist.title, revision: playlist.revision, trackIds: playlist.trackIds },
              "PATCH",
            )
          )
            onChange(null);
          else {
            const latest = await actions.refresh();
            const fresh = latest?.playlists.find((item) => item.id === playlist.id);
            if (fresh && fresh.revision !== playlist.revision)
              onChange({ ...fresh, trackIds: [...fresh.trackIds] });
          }
          setBusy(false);
        }}
      >
        <TextField
          id="edit-playlist-name"
          label={t("library.playlistTitle")}
          required
          maxLength={100}
          value={playlist?.title ?? ""}
          onChange={(e) => playlist && onChange({ ...playlist, title: e.target.value })}
        />
        <ReorderableList
          iconSize={17}
          items={(playlist?.trackIds ?? []).map((id) => ({
            id,
            label: tracks.get(id)?.title[locale] ?? id,
          }))}
          onChange={(trackIds) => playlist && onChange({ ...playlist, trackIds })}
        />
        {!playlist?.trackIds.length && <p>{t("library.noPlaylistTracks")}</p>}
        <div className="dialog-actions">
          <Button disabled={busy || !online}>{t("common.save")}</Button>
          <Button
            type="button"
            variant="secondary"
            danger
            onClick={() => playlist && onDelete(playlist)}
          >
            {t("common.delete")}
          </Button>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}
