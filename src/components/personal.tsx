"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2, Plus, Play, Download, ShieldCheck } from "lucide-react";
import { useApp, useOnline } from "./app-state";
import { Dialog } from "./dialog";
import { Empty, PageHeading, TrackCard } from "./catalog";
import { usePlayer } from "./player";
import type { Locale, Playlist } from "@/lib/types";
import { formatBytes } from "@/lib/audio";
import { api, mutation } from "@/lib/browser/api";
import { recentMoodDays } from "@/lib/wellbeing";

export function AccountGate({
  children,
  context,
}: {
  children: React.ReactNode;
  context?: "mood" | "admin";
}) {
  const t = useTranslations();
  const app = useApp();
  if (app.authLoading) return <p role="status">{t("common.loading")}</p>;
  if (!app.user)
    return (
      <Empty
        title={t(
          context === "mood"
            ? "auth.requiredMood"
            : context === "admin"
              ? "auth.requiredAdmin"
              : "auth.required",
        )}
        text={t(
          context === "mood"
            ? "auth.requiredMoodText"
            : context === "admin"
              ? "auth.requiredAdminText"
              : "auth.requiredText",
        )}
      >
        <button className="button" onClick={app.openAuth}>
          {t("nav.signIn")}
        </button>
      </Empty>
    );
  return (
    <>
      {children}
      {app.error && (
        <p role="alert" className="error">
          {app.error}
        </p>
      )}
    </>
  );
}
export function LibraryView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const player = usePlayer();
  const online = useOnline();
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [edit, setEdit] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [busy, setBusy] = useState(false);
  const [favoritePage, setFavoritePage] = useState(0);
  const editingIds = edit?.trackIds;
  const { ensureTracks, announce } = app;
  const favoriteIds = app.personal?.favorites;
  const playlists = app.personal?.playlists;
  useEffect(() => {
    const ids = [
      ...(favoriteIds || []).slice(favoritePage * 24, (favoritePage + 1) * 24),
      ...(playlists || []).flatMap((playlist) => playlist.trackIds.slice(0, 1)),
      ...(editingIds || []),
    ];
    if (online && ids.length) void ensureTracks(ids).catch(() => announce(t("errors.unavailable")));
  }, [favoriteIds, playlists, editingIds, favoritePage, ensureTracks, online, announce, t]);
  const favorites = (favoriteIds || [])
    .slice(favoritePage * 24, (favoritePage + 1) * 24)
    .flatMap((id) => app.tracks.find((track) => track.id === id) || []);
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
            {app.personal?.playlists.map((playlist) => {
              const recordings = playlist.trackIds.flatMap(
                (id) => app.tracks.find((track) => track.id === id) ?? [],
              );
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
                        app.clearError();
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
          {!app.personal?.playlists.length && (
            <p className="muted">{t("library.emptyPlaylists")}</p>
          )}
        </section>
      </AccountGate>
      <Dialog open={create} onOpenChange={setCreate} title={t("library.newPlaylist")}>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await app.perform("/api/playlists", { title })) setCreate(false);
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
          {app.error && (
            <p className="error" role="alert">
              {app.error}
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
              await app.perform(
                `/api/playlists/${edit.id}`,
                { title: edit.title, revision: edit.revision, trackIds: edit.trackIds },
                "PATCH",
              )
            )
              setEdit(null);
            else {
              const latest = await app.refresh();
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
              const name = app.tracks.find((track) => track.id === id)?.title[locale] ?? id;
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
          {app.error && (
            <p className="error" role="alert">
              {app.error}
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
            if (deleting && (await app.perform(`/api/playlists/${deleting.id}`, {}, "DELETE")))
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
export function DownloadsView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const [confirm, setConfirm] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const total = app.downloaded.reduce((sum, item) => sum + item.bytes, 0);
  return (
    <>
      <PageHeading title={t("downloads.title")} subtitle={t("downloads.subtitle")} />
      <div className="storage-panel">
        <Download size={24} aria-hidden="true" />
        <div>
          <strong>{t("downloads.used", { size: formatBytes(total) })}</strong>
          <p>{t("downloads.note")}</p>
        </div>
        {!!app.downloaded.length && (
          <button className="button secondary" onClick={() => setConfirm(true)}>
            {t("downloads.removeAll")}
          </button>
        )}
      </div>
      {app.downloaded.length ? (
        <div className="track-grid">
          {app.downloaded.map((item) => (
            <div key={item.id}>
              <TrackCard track={item.track} />
              <button
                className="text-button remove-download"
                onClick={() => void app.remove(item.id)}
              >
                {t("common.remove")}: {item.track.title[locale]}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title={t("downloads.empty")} text={t("downloads.emptyText")} />
      )}
      <button
        className="button secondary"
        onClick={async () => {
          try {
            setStorageNote(
              t(
                (await navigator.storage?.persist?.())
                  ? "downloads.persistentGranted"
                  : "downloads.persistentDenied",
              ),
            );
          } catch {
            setStorageNote(t("downloads.persistentDenied"));
          }
        }}
      >
        {t("downloads.persistent")}
      </button>
      {storageNote && <p role="status">{storageNote}</p>}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("downloads.removeTitle")}
        description={t("downloads.removeText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            await app.remove();
            setConfirm(false);
          }}
        >
          {t("downloads.removeAll")}
        </button>
      </Dialog>
    </>
  );
}
export function MoodView() {
  const t = useTranslations();
  const app = useApp();
  const locale = useLocale();
  const online = useOnline();
  const [confirm, setConfirm] = useState(false);
  const pairs = Object.values(
    (app.personal?.checkins ?? []).reduce<
      Record<string, { id: string; date: string; before?: number; after?: number }>
    >((all, entry) => {
      all[entry.session_id] ??= { id: entry.session_id, date: entry.created_at };
      all[entry.session_id][entry.phase] = entry.score;
      return all;
    }, {}),
  );
  return (
    <>
      <PageHeading title={t("mood.title")} subtitle={t("mood.subtitle")} />
      <AccountGate context="mood">
        {!app.personal?.profile.mood_consent_at ? (
          <div className="panel consent-panel">
            <ShieldCheck size={32} aria-hidden="true" />
            <h2>{t("mood.consentTitle")}</h2>
            <p>{t("mood.consentText")}</p>
            <button
              className="button"
              disabled={!online}
              onClick={() => void app.perform("/api/me", { moodConsent: true }, "PATCH")}
            >
              {t("mood.enable")}
            </button>
          </div>
        ) : (
          <>
            <MoodTrends />
            <div className="section-heading">
              <h2>{t("mood.recent")}</h2>
              <button
                className="button secondary danger"
                disabled={!online || !pairs.length}
                onClick={() => setConfirm(true)}
              >
                {t("mood.deleteAll")}
              </button>
            </div>
            {pairs.length ? (
              <div className="panel table-wrap">
                <table>
                  <caption>{t("mood.paired")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("mood.date")}</th>
                      <th scope="col">{t("mood.beforeLabel")}</th>
                      <th scope="col">{t("mood.afterLabel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((pair) => (
                      <tr key={pair.id}>
                        <th scope="row">
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(pair.date))}
                        </th>
                        <td>{pair.before ? t(`mood.score${pair.before}`) : t("mood.noAfter")}</td>
                        <td>{pair.after ? t(`mood.score${pair.after}`) : t("mood.noAfter")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={t("mood.empty")} text={t("mood.emptyText")} />
            )}
          </>
        )}
        <p className="privacy-note">{t("mood.retention")}</p>
        {!online && <p className="info-panel">{t("mood.offline")}</p>}
      </AccountGate>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("mood.deleteTitle")}
        description={t("mood.deleteText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            if (await app.perform("/api/sessions", {}, "DELETE")) setConfirm(false);
          }}
        >
          {t("mood.deleteAll")}
        </button>
      </Dialog>
    </>
  );
}
function MoodTrends() {
  const app = useApp();
  const t = useTranslations("mood");
  const locale = useLocale();
  const days = recentMoodDays(app.personal?.checkins ?? [], new Date());
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  const format = (value: number | null) =>
    value === null ? t("noAfter") : `${number.format(value)} / 5`;
  return (
    <section className="mood-trends panel table-wrap" aria-labelledby="mood-trend-heading">
      <h2 id="mood-trend-heading">{t("trendTitle")}</h2>
      <p>{t("trendNote")}</p>
      <table>
        <caption className="sr-only">{t("trendTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("date")}</th>
            <th scope="col">{t("beforeLabel")}</th>
            <th scope="col">{t("afterLabel")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(`${day.date}T00:00:00+07:00`))}
              </th>
              <td>{format(day.before)}</td>
              <td>{format(day.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function SettingsView() {
  const t = useTranslations();
  const locale = useLocale();
  const app = useApp();
  const online = useOnline();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  return (
    <>
      <PageHeading title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="settings-stack">
        <section className="panel">
          <h2>{t("settings.appearance")}</h2>
          <label className="setting-row" htmlFor="calm-mode">
            <span>
              <strong>{t("settings.calm")}</strong>
              <span className="muted">{t("settings.calmText")}</span>
            </span>
            <input
              id="calm-mode"
              className="switch"
              type="checkbox"
              checked={app.calm}
              onChange={(e) => void app.setCalm(e.target.checked)}
            />
          </label>
          <div className="setting-row">
            <strong>{t("settings.language")}</strong>
            <div className="language-switch">
              {["vi", "en"].map((language) => (
                <Link
                  href={`/${language}/settings`}
                  lang={language}
                  key={language}
                  aria-current={language === locale ? "true" : undefined}
                >
                  {language === "vi" ? "Tiếng Việt" : "English"}
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>{t("settings.account")}</h2>
          {app.user ? (
            <>
              <p>{app.user.email}</p>
              <button className="button secondary" onClick={() => void app.signOut()}>
                {t("auth.signOut")}
              </button>
            </>
          ) : (
            <>
              <p>{t("settings.guestText")}</p>
              <button className="button" onClick={app.openAuth}>
                {t("nav.signIn")}
              </button>
            </>
          )}
        </section>
        {app.user && (
          <section className="panel">
            <h2>{t("settings.privacy")}</h2>
            <p>{t("mood.consentText")}</p>
            <p className="muted">
              {t(app.personal?.profile.mood_consent_at ? "settings.enabled" : "settings.disabled")}
            </p>
            <button
              className="button secondary"
              disabled={!online}
              onClick={() =>
                app.personal?.profile.mood_consent_at
                  ? setRevoke(true)
                  : void app.perform("/api/me", { moodConsent: true }, "PATCH")
              }
            >
              {t(app.personal?.profile.mood_consent_at ? "mood.revoke" : "mood.enable")}
            </button>
            <Link className="text-link" href={`/${locale}/mood`}>
              {t("nav.mood")}
            </Link>
          </section>
        )}
        <section className="panel">
          <h2>{t("settings.install")}</h2>
          <p>{t("settings.installText")}</p>
          {install ? (
            <button
              className="button"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              }}
            >
              {t("settings.installButton")}
            </button>
          ) : (
            <p className="muted small">{t("settings.installManual")}</p>
          )}
        </section>
        {app.user && (
          <section className="panel">
            <button className="button secondary danger" onClick={() => setDeleting(true)}>
              {t("settings.deleteAccount")}
            </button>
          </section>
        )}
      </div>
      {app.error && (
        <p className="error" role="alert">
          {app.error}
        </p>
      )}
      <Dialog
        open={revoke}
        onOpenChange={setRevoke}
        title={t("mood.consentTitle")}
        description={t("mood.deleteText")}
      >
        <button
          className="button danger"
          onClick={async () => {
            if (await app.perform("/api/me", { moodConsent: false }, "PATCH")) setRevoke(false);
          }}
        >
          {t("mood.revoke")}
        </button>
      </Dialog>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("settings.deleteTitle")}
        description={t("settings.deleteText")}
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (confirmation !== "DELETE") return;
            setBusy(true);
            try {
              await mutation("/api/me", { confirmation }, "DELETE", app.user?.id);
              await app.signOut();
              setDeleting(false);
              app.announce(t("settings.deleted"));
            } catch {
              app.announce(t("errors.unavailable"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="delete-confirm">{t("settings.confirmation")}</label>
          <input
            id="delete-confirm"
            value={confirmation}
            autoComplete="off"
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <button className="button danger" disabled={confirmation !== "DELETE" || busy || !online}>
            {t("settings.confirmDelete")}
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function PrivacyView({ terms = false }: { terms?: boolean }) {
  const t = useTranslations("privacy");
  return (
    <article className="legal-page">
      <h1>{t(terms ? "termsTitle" : "title")}</h1>
      {(terms
        ? ["termsIntro", "choice", "rights", "external", "age", "support"]
        : ["intro", "accounts", "mood", "offline", "providers", "logs", "delete", "support"]
      ).map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </article>
  );
}
