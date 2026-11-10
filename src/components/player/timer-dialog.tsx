"use client";
import { useTranslations } from "next-intl";
import type { PlaybackEngine } from "@/lib/playback/engine";
import { sleepTimerChoices } from "@/lib/playback/sleep-timer";
import { Dialog } from "../dialog";

export function TimerDialog({
  engine,
  open,
  onClose,
}: {
  engine: PlaybackEngine;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title={t("player.timerTitle")}
      description={t("player.timerNote")}
    >
      <div className="timer-options">
        {sleepTimerChoices.map((minutes) => (
          <button
            key={minutes}
            className="button secondary"
            onClick={() => {
              engine.setTimer(minutes);
              onClose();
            }}
          >
            {minutes ? t("common.minutes", { count: minutes }) : t("player.timerOff")}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
