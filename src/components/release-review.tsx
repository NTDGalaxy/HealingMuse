"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, mutation, ApiError } from "@/lib/browser/api";
import { useOnline } from "./app-state";

type Release = {
  id: string;
  title: string;
  manifestHash: string;
  expectedCount: number;
  matchingCount: number;
  deliveredCount: number;
  storageProvider: "supabase" | "b2";
  publishedAt: string | null;
  reviewerName: string | null;
};

export function ReleaseReview() {
  const t = useTranslations("admin.release");
  const errors = useTranslations("errors");
  const online = useOnline();
  const [items, setItems] = useState<Release[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ items: Release[] }>("/api/admin/releases", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setItems(result.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(errors("unavailable"));
      });
    return () => controller.abort();
  }, [revision, errors]);
  return (
    <section
      className="release-review reading-surface"
      aria-labelledby="release-heading"
      aria-busy={items === null && !error}
    >
      <h2 id="release-heading">{t("title")}</h2>
      <p>{t("description")}</p>
      {items === null && !error && <p role="status">{t("loading")}</p>}
      {items?.length === 0 && <p>{t("empty")}</p>}
      {items?.map((release) => {
        const ready =
          release.matchingCount === release.expectedCount &&
          release.deliveredCount === release.expectedCount;
        return (
          <article key={release.id} className="release-item">
            <h3>{release.title}</h3>
            <dl className="release-facts">
              <div>
                <dt>{t("storage")}</dt>
                <dd>{release.storageProvider === "b2" ? "Backblaze B2" : "Supabase Storage"}</dd>
              </div>
              <div>
                <dt>{t("recordings")}</dt>
                <dd>{release.expectedCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{t("matching")}</dt>
                <dd>{release.matchingCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{t("delivered")}</dt>
                <dd>{release.deliveredCount.toLocaleString()}</dd>
              </div>
              <div className="manifest-fact">
                <dt>{t("manifest")}</dt>
                <dd>
                  <code>{release.manifestHash}</code>
                </dd>
              </div>
            </dl>
            {release.publishedAt ? (
              <p role="status">{t("published", { name: release.reviewerName ?? "" })}</p>
            ) : (
              <form
                aria-busy={busy}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  setBusy(true);
                  setError("");
                  try {
                    await mutation("/api/admin/releases/publish", {
                      releaseId: release.id,
                      manifestHash: release.manifestHash,
                      reviewerName: String(data.get("reviewerName") ?? ""),
                      attestationVersion: "human-review-v1",
                      listeningConfirmed: data.get("listening") === "on",
                      rightsConfirmed: data.get("rights") === "on",
                      provenanceConfirmed: data.get("provenance") === "on",
                    });
                    setRevision((value) => value + 1);
                  } catch (failure) {
                    setError(
                      failure instanceof ApiError && failure.code === "conflict"
                        ? t("changed")
                        : errors("unavailable"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {(!ready || !online) && (
                  <p id={`release-state-${release.id}`} className="privacy-note" role="status">
                    {!ready && t("incomplete")} {!online && t("offline")}
                  </p>
                )}
                <fieldset
                  disabled={busy || !ready || !online}
                  aria-describedby={!ready || !online ? `release-state-${release.id}` : undefined}
                >
                  <legend>{t("attestation")}</legend>
                  <label htmlFor={`reviewer-${release.id}`}>{t("name")}</label>
                  <input
                    id={`reviewer-${release.id}`}
                    name="reviewerName"
                    maxLength={120}
                    required
                    autoComplete="name"
                  />
                  <label className="check-row">
                    <input type="checkbox" name="listening" required />
                    {t("listening")}
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="rights" required />
                    {t("rights")}
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="provenance" required />
                    {t("provenance")}
                  </label>
                  <p className="muted">{t("identity")}</p>
                  <button className="button">
                    {busy ? t("publishing") : t("publish", { count: release.expectedCount })}
                  </button>
                </fieldset>
              </form>
            )}
          </article>
        );
      })}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !online}
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            {t("refresh")}
          </button>
        </div>
      )}
    </section>
  );
}
