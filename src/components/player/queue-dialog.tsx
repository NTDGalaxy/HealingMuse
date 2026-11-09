"use client";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/types";
import { clock } from "@/lib/audio";
import { useStore } from "@/lib/state/create-store";
import type { PlaybackEngine } from "@/lib/playback/engine";
import { Dialog } from "../dialog";

export function QueueDialog({
  engine,
  open,
  onClose,
}: {
  engine: PlaybackEngine;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const queue = useStore(engine.state, (state) => state.queue);
  const currentId = useStore(engine.state, (state) => state.current?.id);
  return (
    <Dialog open={open} onOpenChange={onClose} title={t("player.queueTitle")}>
      <ol className="queue-list">
        {queue.map((track) => (
          <li key={track.id}>
            <button
              aria-current={track.id === currentId ? "true" : undefined}
              onClick={() => {
                void engine.start(track, queue);
                onClose();
              }}
            >
              {track.title[locale]}
              <span>{clock(track.duration)}</span>
            </button>
          </li>
        ))}
      </ol>
      {!queue.length && <p>{t("player.queueEmpty")}</p>}
    </Dialog>
  );
}
