"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Pencil, Trash2 } from "lucide-react";
import type { CatalogPage, CuratedCollection, Locale, Track } from "@/lib/types";
import { api, mutation } from "@/lib/browser/api";
import { Dialog } from "./dialog";
interface Row extends Omit<CuratedCollection, "trackIds"> {
  curated_collection_items: { track_id: string; position: number }[];
}
export function CollectionEditor({ tracks }: { tracks: Track[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [edit, setEdit] = useState<(Omit<CuratedCollection, "id"> & { id: string | null }) | null>(
    null,
  );
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Track[]>([]);
  const [selected, setSelected] = useState<Track[]>([]);
  const selectedIds = edit?.trackIds.join(",") || "";
  useEffect(() => {
    if (selectedIds)
      void api<Track[]>(`/api/tracks?ids=${selectedIds}`)
        .then(setSelected)
        .catch(() => setError(t("errors.unavailable")));
  }, [selectedIds, t]);
  const choices = [
    ...new Map([...tracks, ...found, ...selected].map((track) => [track.id, track])).values(),
  ];
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const rows = await api<Row[]>("/api/admin/collections");
    setCollections(
      rows.map((row) => ({
        ...row,
        trackIds: row.curated_collection_items
          .sort((a, b) => a.position - b.position)
          .map((item) => item.track_id),
      })),
    );
  };
  useEffect(() => {
    void api<Row[]>("/api/admin/collections")
      .then((rows) =>
        setCollections(
          rows.map((row) => ({
            ...row,
            trackIds: row.curated_collection_items
              .sort((a, b) => a.position - b.position)
              .map((item) => item.track_id),
          })),
        ),
      )
      .catch(() => setError(t("errors.unavailable")));
  }, [t]);
  return (
    <section className="collection-editor">
      <div className="section-heading">
        <h2>{t("admin.collections")}</h2>
        <button
          className="button secondary"
          onClick={() =>
            setEdit({
              id: null,
              title: { vi: "", en: "" },
              goal: "relax",
              trackIds: [],
              revision: 0,
              published: false,
            })
          }
        >
          <Plus size={18} />
          {t("admin.newCollection")}
        </button>
      </div>
      <div className="admin-list">
        {collections.map((collection) => (
          <div className="admin-item" key={collection.id}>
            <strong>{collection.title[locale]}</strong>
            <span>
              {t(`goals.${collection.goal}`)} ·{" "}
              {t(collection.published ? "admin.published" : "admin.draft")}
            </span>
            <button
              className="icon-button"
              aria-label={`${t("admin.edit")}: ${collection.title[locale]}`}
              onClick={() => {
                setEdit(structuredClone(collection));
                setError("");
              }}
            >
              <Pencil size={18} />
            </button>
          </div>
        ))}
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={() => setEdit(null)}
        title={t("admin.collections")}
        description={t("admin.collectionNote")}
        wide
      >
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!edit) return;
            setBusy(true);
            setError("");
            try {
              await mutation("/api/admin/collections", {
                id: edit.id,
                title: edit.title,
                goal: edit.goal,
                trackIds: edit.trackIds,
                revision: edit.revision,
                published: edit.published,
              });
              await refresh();
              setEdit(null);
            } catch {
              setError(t("errors.conflict"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {(["vi", "en"] as const).map((language) => (
            <div className="form-stack" key={language}>
              <label htmlFor={`collection-${language}`}>
                {t(language === "vi" ? "admin.titleVi" : "admin.titleEn")}
              </label>
              <input
                id={`collection-${language}`}
                required
                maxLength={160}
                value={edit?.title[language] ?? ""}
                onChange={(event) =>
                  edit &&
                  setEdit({ ...edit, title: { ...edit.title, [language]: event.target.value } })
                }
              />
            </div>
          ))}
          <label htmlFor="collection-goal">{t("admin.goals")}</label>
          <select
            id="collection-goal"
            value={edit?.goal}
            onChange={(event) =>
              edit && setEdit({ ...edit, goal: event.target.value as CuratedCollection["goal"] })
            }
          >
            {["relax", "rest", "focus"].map((goal) => (
              <option key={goal} value={goal}>
                {t(`goals.${goal}`)}
              </option>
            ))}
          </select>
          <ol className="edit-list">
            {edit?.trackIds.map((id, index) => {
              const title = choices.find((track) => track.id === id)?.title[locale] ?? id;
              const move = (offset: number) => {
                if (!edit) return;
                const ids = [...edit.trackIds];
                [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
                setEdit({ ...edit, trackIds: ids });
              };
              return (
                <li key={id}>
                  <span>{title}</span>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={!index}
                    aria-label={t("library.moveUp", { title })}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === edit.trackIds.length - 1}
                    aria-label={t("library.moveDown", { title })}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${t("common.remove")}: ${title}`}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        trackIds: edit.trackIds.filter((trackId) => trackId !== id),
                      })
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              );
            })}
          </ol>
          <label htmlFor="collection-search">{t("catalog.search")}</label>
          <div className="search-box">
            <input
              id="collection-search"
              type="search"
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="button secondary"
              type="button"
              onClick={async () => {
                try {
                  const page = await api<CatalogPage>(
                    `/api/catalog?${new URLSearchParams({ q: search })}`,
                  );
                  setFound(page.items);
                } catch {
                  setError(t("errors.unavailable"));
                }
              }}
            >
              {t("catalog.search")}
            </button>
          </div>
          <label htmlFor="collection-add">{t("catalog.playlistAdd")}</label>
          <select
            id="collection-add"
            value=""
            onChange={(event) => {
              if (edit && event.target.value)
                setEdit({ ...edit, trackIds: [...edit.trackIds, event.target.value] });
            }}
          >
            <option value="">{t("common.all")}</option>
            {choices
              .filter((track) => track.status === "published" && !edit?.trackIds.includes(track.id))
              .map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title[locale]} ({t(`admin.${track.status}`)})
                </option>
              ))}
          </select>
          <label className="check-label">
            <input
              type="checkbox"
              checked={edit?.published ?? false}
              onChange={(event) => edit && setEdit({ ...edit, published: event.target.checked })}
            />
            {t("admin.published")}
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {t("common.save")}
          </button>
        </form>
      </Dialog>
    </section>
  );
}
