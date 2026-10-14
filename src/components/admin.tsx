"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil, Headphones, ArrowUpRight } from "lucide-react";
import { useApp, useOnline } from "./app-state";
import { AccountGate } from "./personal";
import { PageHeading } from "./catalog";
import { Dialog } from "./dialog";
import { CollectionEditor } from "./collections";
import { ReleaseReview } from "./release-review";
import { api, mutation } from "@/lib/browser/api";
import { taxonomy } from "@/lib/catalog-taxonomy";
import { trackInput } from "@/lib/validation";
import type { CatalogPage, Locale, Track, TrackSource } from "@/lib/types";
const empty = (): Track => ({
  id: crypto.randomUUID(),
  title: { vi: "", en: "" },
  description: { vi: "", en: "" },
  artist: "",
  category: "instrumental",
  goals: ["relax"],
  duration: 60,
  source: { kind: "hosted", path: "" },
  downloadAllowed: false,
  artwork: "forest",
  color: "sage",
  attribution: "",
  license: "",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  provenanceUrl: "",
  status: "draft",
  rightsVerified: false,
  humanCreated: false,
  position: 0,
});
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
  function field(
    key: "artist" | "license" | "licenseUrl" | "provenanceUrl" | "attribution" | "color",
    label: string,
    type = "text",
  ) {
    return (
      <div>
        <label htmlFor={`admin-${key}`}>{t(`admin.${label}`)}</label>
        <input
          id={`admin-${key}`}
          type={type}
          required
          value={edit?.[key] ?? ""}
          onChange={(e) => update(key, e.target.value)}
        />
      </div>
    );
  }
  return (
    <>
      <PageHeading title={t("admin.title")} subtitle={t("admin.subtitle")} />
      <AccountGate context="admin">
        {allowed ? (
          <>
            <p className="privacy-note">{t("admin.noMood")}</p>
            <ReleaseReview />
            <div className="section-heading">
              <p>{t("admin.count", { count: page.total })}</p>
              <button
                className="button"
                disabled={!online}
                onClick={() => {
                  setEdit(empty());
                  setError("");
                }}
              >
                <Plus size={18} />
                {t("admin.new")}
              </button>
            </div>
            <form
              className="search-box"
              onSubmit={(event) => {
                event.preventDefault();
                setCursor("");
                setSearch(String(new FormData(event.currentTarget).get("q") || ""));
              }}
            >
              <label className="sr-only" htmlFor="review-search">
                {t("catalog.search")}
              </label>
              <input
                name="q"
                id="review-search"
                type="search"
                maxLength={120}
                placeholder={t("catalog.searchPlaceholder")}
              />
              <button className="button">{t("catalog.search")}</button>
            </form>
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
            <nav className="catalog-pagination" aria-label={t("catalog.pages")}>
              {cursor && (
                <button className="button secondary" onClick={() => setCursor("")}>
                  {t("common.back")}
                </button>
              )}
              {page.nextCursor && (
                <button className="button" onClick={() => setCursor(page.nextCursor!)}>
                  {t("catalog.next")}
                </button>
              )}
            </nav>
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
      {error && !edit && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={() => {
          setEdit(null);
          setPreview(null);
        }}
        title={t("admin.edit")}
        description={t("admin.previewNote")}
        wide
      >
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const rejecting =
              submitter instanceof HTMLButtonElement && submitter.value === "reject";
            const parsed = trackInput.safeParse(
              rejecting
                ? { ...edit, status: "retired", rightsVerified: false, listeningReviewed: false }
                : edit,
            );
            if (
              !parsed.success ||
              (parsed.success &&
                parsed.data.status === "published" &&
                !parsed.data.listeningReviewed)
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
          }}
        >
          <div className="admin-grid">
            {(["vi", "en"] as const).map((language) => (
              <div key={language}>
                <label htmlFor={`admin-title-${language}`}>
                  {t(language === "vi" ? "admin.titleVi" : "admin.titleEn")}
                </label>
                <input
                  id={`admin-title-${language}`}
                  required
                  maxLength={160}
                  value={edit?.title[language] ?? ""}
                  onChange={(e) =>
                    edit && update("title", { ...edit.title, [language]: e.target.value })
                  }
                />
                <label htmlFor={`admin-description-${language}`}>
                  {t(language === "vi" ? "admin.descriptionVi" : "admin.descriptionEn")}
                </label>
                <textarea
                  id={`admin-description-${language}`}
                  required
                  maxLength={600}
                  value={edit?.description[language] ?? ""}
                  onChange={(e) =>
                    edit &&
                    update("description", { ...edit.description, [language]: e.target.value })
                  }
                />
              </div>
            ))}
            {field("artist", "artist")}
            {field("attribution", "attribution")}
            {field("license", "license")}
            {field("licenseUrl", "licenseUrl", "url")}
            {field("provenanceUrl", "provenance", "url")}
            <div>
              <label htmlFor="admin-color">{t("admin.color")}</label>
              <select
                id="admin-color"
                value={edit?.color}
                onChange={(e) => update("color", e.target.value)}
              >
                {["sage", "sand", "blue", "lavender", "rose"].map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.colorOptions.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-category">{t("admin.category")}</label>
              <select
                id="admin-category"
                value={edit?.category}
                onChange={(e) => update("category", e.target.value as Track["category"])}
              >
                {["instrumental", "nature"].map((value) => (
                  <option value={value} key={value}>
                    {t(`catalog.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-artwork">{t("admin.artwork")}</label>
              <select
                id="admin-artwork"
                value={edit?.artwork}
                onChange={(e) => update("artwork", e.target.value as Track["artwork"])}
              >
                {["forest", "rain", "river", "sea", "night", "piano"].map((value) => (
                  <option value={value} key={value}>
                    {t(`admin.artworkOptions.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-source">{t("admin.source")}</label>
              <select
                id="admin-source"
                value={edit?.source.kind}
                onChange={(e) => {
                  const kind = e.target.value;
                  update(
                    "source",
                    kind === "hosted"
                      ? { kind, path: "" }
                      : kind === "youtube"
                        ? { kind, videoId: "" }
                        : { kind: "spotify_link", url: "" },
                  );
                  update("downloadAllowed", false);
                }}
              >
                {["hosted", "youtube", "spotify_link"].map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-source-value">{t("admin.sourceValue")}</label>
              <input
                id="admin-source-value"
                required
                value={
                  edit?.source.kind === "hosted"
                    ? edit.source.path
                    : edit?.source.kind === "youtube"
                      ? edit.source.videoId
                      : (edit?.source.url ?? "")
                }
                onChange={(e) => {
                  if (!edit) return;
                  const kind = edit.source.kind;
                  const source: TrackSource =
                    kind === "hosted"
                      ? { kind, path: e.target.value }
                      : kind === "youtube"
                        ? { kind, videoId: e.target.value }
                        : { kind, url: e.target.value };
                  update("source", source);
                }}
              />
            </div>
            {(["duration", "position"] as const).map((key) => (
              <div key={key}>
                <label htmlFor={`admin-${key}`}>{t(`admin.${key}`)}</label>
                <input
                  id={`admin-${key}`}
                  type="number"
                  min={key === "duration" ? 1 : 0}
                  max={key === "duration" ? 14400 : 10000}
                  required
                  value={edit?.[key] ?? 0}
                  onChange={(e) => update(key, Number(e.target.value))}
                />
              </div>
            ))}
            <div>
              <label htmlFor="admin-status">{t("admin.status")}</label>
              <select
                id="admin-status"
                value={edit?.status}
                onChange={(e) => update("status", e.target.value as Track["status"])}
              >
                {["draft", "published", "retired"].map((value) => (
                  <option value={value} key={value}>
                    {t(`admin.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {(["genre", "instrument", "tradition"] as const).map((field) => {
            const key =
              field === "genre" ? "genres" : field === "instrument" ? "instruments" : "traditions";
            return (
              <fieldset key={field}>
                <legend>{t(`catalog.${field}`)}</legend>
                {taxonomy[field].map((value) => (
                  <label className="check-label" key={value}>
                    <input
                      type="checkbox"
                      checked={edit?.[key]?.includes(value) || false}
                      onChange={(event) =>
                        edit &&
                        update(
                          key,
                          event.target.checked
                            ? [...(edit[key] || []), value]
                            : (edit[key] || []).filter((tag) => tag !== value),
                        )
                      }
                    />
                    {t(`taxonomy.${field}.${value}`)}
                  </label>
                ))}
              </fieldset>
            );
          })}
          <fieldset>
            <legend>{t("admin.goals")}</legend>
            {(["relax", "rest", "focus"] as const).map((goal) => (
              <label className="check-label" key={goal}>
                <input
                  type="checkbox"
                  checked={edit?.goals.includes(goal) ?? false}
                  onChange={(e) =>
                    edit &&
                    update(
                      "goals",
                      e.target.checked
                        ? [...edit.goals, goal]
                        : edit.goals.filter((item) => item !== goal),
                    )
                  }
                />
                {t(`goals.${goal}`)}
              </label>
            ))}
          </fieldset>
          {(
            ["rightsVerified", "humanCreated", "listeningReviewed", "downloadAllowed"] as const
          ).map((key) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={edit?.[key] ?? false}
                disabled={key === "downloadAllowed" && edit?.source.kind !== "hosted"}
                onChange={(e) => update(key, e.target.checked)}
              />
              {t(
                `admin.${key === "rightsVerified" ? "rights" : key === "humanCreated" ? "human" : key === "listeningReviewed" ? "listening" : "download"}`,
              )}
            </label>
          ))}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button" disabled={busy || !online}>
              {t("admin.save")}
            </button>
            {edit && tracks.some((track) => track.id === edit.id) && edit.status !== "retired" && (
              <button
                className="button secondary"
                name="reviewAction"
                value="reject"
                disabled={busy || !online}
              >
                {t("admin.reject")}
              </button>
            )}
            {edit?.source.kind === "hosted" && tracks.some((track) => track.id === edit.id) && (
              <button
                className="button secondary"
                type="button"
                onClick={async () => {
                  try {
                    const data = await api<{ url: string }>(`/api/admin/preview/${edit.id}`);
                    setPreview(data.url);
                  } catch {
                    setError(t("errors.unavailable"));
                  }
                }}
              >
                <Headphones size={18} />
                {t("admin.preview")}
              </button>
            )}
          </div>
          {preview && <audio src={preview} controls aria-label={t("admin.preview")} />}
        </form>
      </Dialog>
    </>
  );
}
