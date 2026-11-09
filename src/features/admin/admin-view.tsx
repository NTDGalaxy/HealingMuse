"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil, Headphones, ArrowUpRight } from "lucide-react";
import { useApp, useOnline } from "@/components/app-state";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { AccountGate } from "@/features/account/account-gate";
import { CollectionEditor } from "./collection-editor";
import { ReleaseReview } from "./release-review";
import { emptyTrack, TrackEditor } from "./track-editor";
import { api, mutation } from "@/lib/browser/api";
import { trackInput } from "@/lib/validation";
import type { CatalogPage, Locale, Track } from "@/lib/types";

export function AdminView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const online = useOnline();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [page, setPage] = useState<CatalogPage>({ items: [], total: 0, nextCursor: null });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [edit, setEdit] = useState<Track | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const allowed = app.personal?.isAdmin;
  useEffect(() => {
    const controller = new AbortController();
    if (allowed)
      void api<CatalogPage>(
        `/api/admin/tracks?${new URLSearchParams({ q: search, status, cursor })}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          setError("");
          setPage(data);
          setTracks(data.items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(t("errors.unavailable"));
        });
    return () => controller.abort();
  }, [allowed, search, status, cursor, t]);
  const update = <K extends keyof Track>(key: K, value: Track[K]) => {
    setEdit((previous) => (previous ? { ...previous, [key]: value } : null));
  };
  async function save(reject: boolean) {
    const parsed = trackInput.safeParse(
      reject
        ? { ...edit, status: "retired", rightsVerified: false, listeningReviewed: false }
        : edit,
    );
    if (
      !parsed.success ||
      (parsed.success && parsed.data.status === "published" && !parsed.data.listeningReviewed)
    ) {
      setError(t("admin.invalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutation("/api/admin/tracks", parsed.data);
      const data = await api<CatalogPage>(
        `/api/admin/tracks?${new URLSearchParams({ q: search, status, cursor })}`,
      );
      setPage(data);
      setTracks(data.items);
      setEdit(null);
      setPreview(null);
      app.announce(t("admin.saved"));
    } catch {
      setError(t("errors.unavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
      <AccountGate context="admin">
        {allowed ? (
          <>
            <p className="privacy-note">{t("admin.noMood")}</p>
            <ReleaseReview />
            <div className="section-heading">
              <p>{t("admin.count", { count: page.total })}</p>
              <Button
                disabled={!online}
                onClick={() => {
                  setEdit(emptyTrack());
                  setError("");
                }}
              >
                <Plus size={18} />
                {t("admin.new")}
              </Button>
            </div>
            <SearchField
              id="review-search"
              label={t("catalog.search")}
              placeholder={t("catalog.searchPlaceholder")}
              onSubmit={(event) => {
                event.preventDefault();
                setCursor("");
                setSearch(String(new FormData(event.currentTarget).get("q") || ""));
              }}
            />
            <label className="review-filter" htmlFor="review-status">
              {t("admin.status")}
              <select
                id="review-status"
                value={status}
                onChange={(event) => {
                  setCursor("");
                  setStatus(event.target.value);
                }}
              >
                <option value="">{t("common.all")}</option>
                {["draft", "published", "retired"].map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-list">
              {tracks.map((track) => (
                <article className="admin-item" key={track.id}>
                  <div>
                    <strong>{track.title[locale]}</strong>
                    <span>
                      {track.artist} · {track.source.kind} · {track.position}
                    </span>
                  </div>
                  <div className="review-actions">
                    <a
                      className="icon-button"
                      href={track.provenanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t("catalog.source")}: ${track.title[locale]}`}
                    >
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </a>
                    {track.source.kind === "hosted" && track.status !== "retired" && (
                      <button
                        className="icon-button"
                        disabled={!online}
                        aria-label={`${t("admin.preview")}: ${track.title[locale]}`}
                        onClick={async () => {
                          try {
                            const result = await api<{ url: string }>(
                              `/api/admin/preview/${track.id}`,
                            );
                            setPreviewId(track.id);
                            setPreview(result.url);
                          } catch {
                            setError(t("errors.unavailable"));
                          }
                        }}
                      >
                        <Headphones size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <span className="status-pill">{t(`admin.${track.status}`)}</span>
                  <button
                    className="icon-button"
                    disabled={!online}
                    aria-label={`${t("admin.edit")}: ${track.title[locale]}`}
                    onClick={() => {
                      setEdit(structuredClone(track));
                      setError("");
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                </article>
              ))}
            </div>
            <Pagination
              label={t("catalog.pages")}
              back={cursor !== "" && { label: t("common.back"), onClick: () => setCursor("") }}
              next={
                !!page.nextCursor && {
                  label: t("catalog.next"),
                  onClick: () => setCursor(page.nextCursor!),
                }
              }
            />
            {!edit && preview && (
              <div className="panel review-preview">
                <p>{tracks.find((track) => track.id === previewId)?.title[locale]}</p>
                <audio controls src={preview} aria-label={t("admin.preview")} />
              </div>
            )}
            <CollectionEditor tracks={tracks} />
          </>
        ) : (
          <p className="info-panel">{t("admin.restrictedText")}</p>
        )}
      </AccountGate>
      {error && !edit && <InlineAlert>{error}</InlineAlert>}
      <TrackEditor
        draft={edit}
        saved={tracks.find((track) => track.id === edit?.id)}
        update={update}
        busy={busy}
        online={online}
        error={error}
        preview={preview}
        onClose={() => {
          setEdit(null);
          setPreview(null);
        }}
        onSave={(reject) => void save(reject)}
        onPreview={async () => {
          if (!edit) return;
          try {
            const data = await api<{ url: string }>(`/api/admin/preview/${edit.id}`);
            setPreview(data.url);
          } catch {
            setError(t("errors.unavailable"));
          }
        }}
      />
    </>
  );
}
