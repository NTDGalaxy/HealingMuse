"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil } from "lucide-react";
import type { CatalogPage, CuratedCollection, Locale, Track } from "@/lib/types";
import { api, mutation } from "@/lib/browser/api";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ReorderableList } from "@/components/ui/reorderable-list";
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
        <Button
          variant="secondary"
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
        </Button>
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
              <TextField
                id={`collection-${language}`}
                label={t(language === "vi" ? "admin.titleVi" : "admin.titleEn")}
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
          <SelectField
            id="collection-goal"
            label={t("admin.goals")}
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
          </SelectField>
          <ReorderableList
            iconSize={18}
            items={(edit?.trackIds ?? []).map((id) => ({
              id,
              label: choices.find((track) => track.id === id)?.title[locale] ?? id,
            }))}
            onChange={(trackIds) => edit && setEdit({ ...edit, trackIds })}
          />
          <label htmlFor="collection-search">{t("catalog.search")}</label>
          <div className="search-box">
            <input
              id="collection-search"
              type="search"
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
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
            </Button>
          </div>
          <SelectField
            id="collection-add"
            label={t("catalog.playlistAdd")}
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
          </SelectField>
          <CheckboxField
            checked={edit?.published ?? false}
            onChange={(event) => edit && setEdit({ ...edit, published: event.target.checked })}
            label={t("admin.published")}
          />
          {error && <InlineAlert>{error}</InlineAlert>}
          <Button disabled={busy}>{t("common.save")}</Button>
        </form>
      </Dialog>
    </section>
  );
}
