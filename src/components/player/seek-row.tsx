"use client";
import { useTranslations } from "next-intl";
import { clock } from "@/lib/audio";
import { useStore } from "@/lib/state/create-store";
import type { PlaybackEngine } from "@/lib/playback/engine";

/** Elapsed time, the seek slider and the duration. The only part that renders on every tick. */
export function SeekRow({ engine }: { engine: PlaybackEngine }) {
  const t = useTranslations();
  const position = useStore(engine.position);
  const duration = useStore(engine.state, (state) => state.duration);
  const idle = useStore(engine.state, (state) => !state.current);
  return (
    <div className="seek-row">
      <span>{clock(position)}</span>
      <input
        aria-label={t("player.seek")}
        type="range"
        min={0}
        max={duration || 1}
        step={1}
        value={Math.min(position, duration || 1)}
        aria-valuetext={`${clock(position)} / ${clock(duration)}`}
        disabled={idle}
        onChange={(e) => engine.seek(Number(e.target.value))}
      />
      <span>{clock(duration)}</span>
    </div>
  );
}
