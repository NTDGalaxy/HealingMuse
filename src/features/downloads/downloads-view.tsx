"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useApp } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Empty, PageHeading, TrackCard } from "@/components/catalog";
import type { Locale } from "@/lib/types";
import { formatBytes } from "@/lib/audio";

export function DownloadsView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const [confirm, setConfirm] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const total = app.downloaded.reduce((sum, item) => sum + item.bytes, 0);
  // The queue is exactly the saved recordings shown here, so playback never streams offline.
  const queue = useMemo(() => app.downloaded.map((item) => item.track), [app.downloaded]);
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
          {app.downloaded.map((item, index) => (
            <div key={item.id}>
              <TrackCard track={item.track} queue={queue} primary={index === 0} />
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
