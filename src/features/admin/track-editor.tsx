"use client";
import { useTranslations } from "next-intl";
import { Headphones } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { taxonomy } from "@/lib/catalog-taxonomy";
import { trackColors } from "@/lib/validation";
import type { Track, TrackSource } from "@/lib/types";

export type UpdateTrack = <K extends keyof Track>(key: K, value: Track[K]) => void;

/** A blank draft for a new recording; it stays unpublished until release review. */
export const emptyTrack = (): Track => ({
  id: crypto.randomUUID(),
  title: { vi: "", en: "" },
  description: { vi: "", en: "" },
  artist: "",
  category: "instrumental",
  goals: ["relax"],
  genres: [],
  instruments: [],
  traditions: [],
  listeningReviewed: false,
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

/**
 * The recording editor. `saved` is the stored row the draft edits (absent for a new recording):
 * it decides whether the recording can be rejected or previewed, and the status select offers
 * "published" only for a row release review has already published.
 */
export function TrackEditor({
  draft,
  saved,
  update,
  busy,
  online,
  error,
  preview,
  onClose,
  onSave,
  onPreview,
}: {
  draft: Track | null;
  saved: Track | undefined;
  update: UpdateTrack;
  busy: boolean;
  online: boolean;
  error: string;
  preview: string | null;
  onClose: () => void;
  /** Saves the draft, or retires it with its review flags cleared when `reject` is set. */
  onSave: (reject: boolean) => void;
  onPreview: () => void;
}) {
  const t = useTranslations();
  const text = (
    key: "artist" | "license" | "licenseUrl" | "provenanceUrl" | "attribution" | "color",
    label: string,
    type = "text",
  ) => (
    <div>
      <TextField
        id={`admin-${key}`}
        label={t(`admin.${label}`)}
        type={type}
        required
        value={draft?.[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
      />
    </div>
  );
  return (
    <Dialog
      open={!!draft}
      onOpenChange={onClose}
      title={t("admin.edit")}
      description={t("admin.previewNote")}
      wide
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          onSave(submitter instanceof HTMLButtonElement && submitter.value === "reject");
        }}
      >
        <div className="admin-grid">
          {(["vi", "en"] as const).map((language) => (
            <div key={language}>
              <TextField
                id={`admin-title-${language}`}
                label={t(language === "vi" ? "admin.titleVi" : "admin.titleEn")}
                required
                maxLength={160}
                value={draft?.title[language] ?? ""}
                onChange={(e) =>
                  draft && update("title", { ...draft.title, [language]: e.target.value })
                }
              />
              <TextAreaField
                id={`admin-description-${language}`}
                label={t(language === "vi" ? "admin.descriptionVi" : "admin.descriptionEn")}
                required
                maxLength={600}
                value={draft?.description[language] ?? ""}
                onChange={(e) =>
                  draft &&
                  update("description", { ...draft.description, [language]: e.target.value })
                }
              />
            </div>
          ))}
          {text("artist", "artist")}
          {text("attribution", "attribution")}
          {text("license", "license")}
          {text("licenseUrl", "licenseUrl", "url")}
          {text("provenanceUrl", "provenance", "url")}
          <div>
            <SelectField
              id="admin-color"
              label={t("admin.color")}
              value={draft?.color}
              onChange={(e) => update("color", e.target.value as Track["color"])}
            >
              {trackColors.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.colorOptions.${value}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <SelectField
              id="admin-category"
              label={t("admin.category")}
              value={draft?.category}
              onChange={(e) => update("category", e.target.value as Track["category"])}
            >
              {["instrumental", "nature"].map((value) => (
                <option value={value} key={value}>
                  {t(`catalog.${value}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <SelectField
              id="admin-artwork"
              label={t("admin.artwork")}
              value={draft?.artwork}
              onChange={(e) => update("artwork", e.target.value as Track["artwork"])}
            >
              {["forest", "rain", "river", "sea", "night", "piano"].map((value) => (
                <option value={value} key={value}>
                  {t(`admin.artworkOptions.${value}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <SelectField
              id="admin-source"
              label={t("admin.source")}
              value={draft?.source.kind}
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
            </SelectField>
          </div>
          <div>
            <TextField
              id="admin-source-value"
              label={t("admin.sourceValue")}
              required
              value={
                draft?.source.kind === "hosted"
                  ? draft.source.path
                  : draft?.source.kind === "youtube"
                    ? draft.source.videoId
                    : (draft?.source.url ?? "")
              }
              onChange={(e) => {
                if (!draft) return;
                const kind = draft.source.kind;
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
              <TextField
                id={`admin-${key}`}
                label={t(`admin.${key}`)}
                type="number"
                min={key === "duration" ? 1 : 0}
                max={key === "duration" ? 14400 : 10000}
                required
                value={draft?.[key] ?? 0}
                onChange={(e) => update(key, Number(e.target.value))}
              />
            </div>
          ))}
          <div>
            <SelectField
              id="admin-status"
              label={t("admin.status")}
              value={draft?.status}
              onChange={(e) => update("status", e.target.value as Track["status"])}
            >
              {["draft", "published", "retired"]
                // Publishing happens only through release review; keep it for published rows.
                .filter((value) => value !== "published" || saved?.status === "published")
                .map((value) => (
                  <option value={value} key={value}>
                    {t(`admin.${value}`)}
                  </option>
                ))}
            </SelectField>
          </div>
        </div>
        {(["genre", "instrument", "tradition"] as const).map((field) => {
          const key =
            field === "genre" ? "genres" : field === "instrument" ? "instruments" : "traditions";
          return (
            <fieldset key={field}>
              <legend>{t(`catalog.${field}`)}</legend>
              {taxonomy[field].map((value) => (
                <CheckboxField
                  key={value}
                  checked={draft?.[key]?.includes(value) || false}
                  onChange={(event) =>
                    draft &&
                    update(
                      key,
                      event.target.checked
                        ? [...(draft[key] || []), value]
                        : (draft[key] || []).filter((tag) => tag !== value),
                    )
                  }
                  label={t(`taxonomy.${field}.${value}`)}
                />
              ))}
            </fieldset>
          );
        })}
        <fieldset>
          <legend>{t("admin.goals")}</legend>
          {(["relax", "rest", "focus"] as const).map((goal) => (
            <CheckboxField
              key={goal}
              checked={draft?.goals.includes(goal) ?? false}
              onChange={(e) =>
                draft &&
                update(
                  "goals",
                  e.target.checked
                    ? [...draft.goals, goal]
                    : draft.goals.filter((item) => item !== goal),
                )
              }
              label={t(`goals.${goal}`)}
            />
          ))}
        </fieldset>
        {(["rightsVerified", "humanCreated", "listeningReviewed", "downloadAllowed"] as const).map(
          (key) => (
            <CheckboxField
              key={key}
              checked={draft?.[key] ?? false}
              disabled={key === "downloadAllowed" && draft?.source.kind !== "hosted"}
              onChange={(e) => update(key, e.target.checked)}
              label={t(
                `admin.${key === "rightsVerified" ? "rights" : key === "humanCreated" ? "human" : key === "listeningReviewed" ? "listening" : "download"}`,
              )}
            />
          ),
        )}
        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="dialog-actions">
          <Button disabled={busy || !online}>{t("admin.save")}</Button>
          {draft && saved && draft.status !== "retired" && (
            <Button
              variant="secondary"
              name="reviewAction"
              value="reject"
              disabled={busy || !online}
            >
              {t("admin.reject")}
            </Button>
          )}
          {draft?.source.kind === "hosted" && saved && (
            <Button variant="secondary" type="button" onClick={onPreview}>
              <Headphones size={18} />
              {t("admin.preview")}
            </Button>
          )}
        </div>
        {preview && <audio src={preview} controls aria-label={t("admin.preview")} />}
      </form>
    </Dialog>
  );
}
