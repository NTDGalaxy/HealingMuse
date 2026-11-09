"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useAppActions, useDownloadedRecords } from "@/components/app-state";
import { TrackCard } from "@/components/catalog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/lib/types";
import { formatBytes } from "@/lib/audio";

export function DownloadsView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { remove } = useAppActions();
  const downloaded = useDownloadedRecords();
  const [confirm, setConfirm] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const total = downloaded.reduce((sum, item) => sum + item.bytes, 0);
  // The queue is exactly the saved recordings shown here, so playback never streams offline.
  const queue = useMemo(() => downloaded.map((item) => item.track), [downloaded]);
  return (
    <>
      <PageHeader title={t("downloads.title")} subtitle={t("downloads.subtitle")} />
      <div className="storage-panel">
        <Download size={24} aria-hidden="true" />
        <div>
          <strong>{t("downloads.used", { size: formatBytes(total) })}</strong>
          <p>{t("downloads.note")}</p>
        </div>
        {!!downloaded.length && (
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            {t("downloads.removeAll")}
          </Button>
        )}
      </div>
      {downloaded.length ? (
        <div className="track-grid">
          {downloaded.map((item, index) => (
            <div key={item.id}>
              <TrackCard track={item.track} queue={queue} primary={index === 0} />
              <button className="text-button remove-download" onClick={() => void remove(item.id)}>
                {t("common.remove")}: {item.track.title[locale]}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t("downloads.empty")} text={t("downloads.emptyText")} />
      )}
      <Button
        variant="secondary"
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
      </Button>
      {storageNote && <p role="status">{storageNote}</p>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("downloads.removeTitle")}
        description={t("downloads.removeText")}
        confirmLabel={t("downloads.removeAll")}
        onConfirm={async () => {
          await remove();
          setConfirm(false);
        }}
      />
    </>
  );
}
