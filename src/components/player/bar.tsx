"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  Timer,
  Repeat2,
  Square,
} from "lucide-react";
import type { Locale } from "@/lib/types";
import { useStore } from "@/lib/state/create-store";
import type { PlaybackEngine } from "@/lib/playback/engine";
import { NatureArt } from "../art";
import { SeekRow } from "./seek-row";

export type PlayerDialog = "queue" | "timer";

/** The persistent player bar: the recording, transport, seek row and the player tools. */
export function PlayerBar({
  engine,
  openDialog,
}: {
  engine: PlaybackEngine;
  openDialog: (dialog: PlayerDialog) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const current = useStore(engine.state, (state) => state.current);
  const playing = useStore(engine.state, (state) => state.playing);
  const loading = useStore(engine.state, (state) => state.loading);
  const repeat = useStore(engine.state, (state) => state.repeat);
  const error = useStore(engine.state, (state) => state.error);
  const controlsHidden = useStore(engine.state, (state) => state.controlsHidden);
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      style={controlsHidden || !current ? { display: "none" } : undefined}
      className={`player-bar ${current ? "active" : "idle"} ${expanded ? "expanded" : ""}`}
      data-bottom-overlay=""
      aria-label={t("player.nowPlaying")}
    >
      <div className="player-track">
        {current && <NatureArt kind={current.artwork} color={current.color} />}
        <div>
          <strong>{current?.title[locale] ?? t("player.idle")}</strong>
          <span className="muted small">{current?.artist ?? t("player.idleNote")}</span>
        </div>
      </div>
      <div className="playback-controls">
        <div className="player-buttons">
          <button
            className="icon-button"
            disabled={!current}
            aria-label={t("player.previous")}
            onClick={() => engine.advance(-1)}
          >
            <SkipBack size={19} />
          </button>
          <button
            className="play-button"
            aria-label={t(playing ? "player.pause" : "player.play")}
            disabled={!current || loading}
            onClick={() => void engine.toggle()}
          >
            {playing ? (
              <Pause size={21} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            disabled={!current}
            aria-label={t("player.next")}
            onClick={() => engine.advance(1)}
          >
            <SkipForward size={19} />
          </button>
        </div>
        <SeekRow engine={engine} />
      </div>
      <button
        className="player-expand button secondary"
        aria-expanded={expanded}
        aria-controls="player-tools"
        onClick={() => setExpanded(!expanded)}
      >
        {t(expanded ? "player.collapse" : "player.expand")}
      </button>
      <div className="player-tools" id="player-tools">
        <button
          className="icon-button"
          aria-label={t("player.repeat")}
          aria-pressed={repeat}
          onClick={engine.toggleRepeat}
        >
          <Repeat2 size={20} />
        </button>
        <TimerButton engine={engine} onClick={() => openDialog("timer")} />
        <button
          className="icon-button"
          aria-label={t("player.queue")}
          onClick={() => openDialog("queue")}
        >
          <ListMusic size={20} />
        </button>
        <button
          className="icon-button"
          disabled={!current}
          aria-label={t("player.finish")}
          onClick={engine.finish}
        >
          <Square size={17} />
        </button>
      </div>
      {error && (
        <div className="player-error" role="alert">
          {t(error)}
          <button className="text-button" onClick={() => void engine.toggle()}>
            {t("common.retry")}
          </button>
        </div>
      )}
    </section>
  );
}

function TimerButton({ engine, onClick }: { engine: PlaybackEngine; onClick: () => void }) {
  const t = useTranslations();
  const minutes = useStore(engine.timer);
  return (
    <button
      className="icon-button"
      aria-label={minutes ? t("player.timerActive", { minutes }) : t("player.timer")}
      onClick={onClick}
    >
      <Timer size={20} />
      {minutes !== null && <small>{minutes}</small>}
    </button>
  );
}
