"use client";
import { memo, useCallback, useState } from "react";
import type { PlaybackEngine } from "@/lib/playback/engine";
import { PlayerBar, type PlayerDialog } from "./bar";
import { QueueDialog } from "./queue-dialog";
import { TimerDialog } from "./timer-dialog";
import { MoodCheckIns } from "./mood-check-ins";
import { ExternalDialog } from "./external-dialog";

/**
 * Everything the player renders. Each part subscribes to the engine stores it shows, so the
 * provider (and with it every usePlayer() consumer) never renders for them.
 */
export const PlayerSurfaces = memo(function PlayerSurfaces({ engine }: { engine: PlaybackEngine }) {
  const [dialog, setDialog] = useState<PlayerDialog | null>(null);
  const close = useCallback(() => setDialog(null), []);
  return (
    <>
      <PlayerBar engine={engine} openDialog={setDialog} />
      <QueueDialog engine={engine} open={dialog === "queue"} onClose={close} />
      <TimerDialog engine={engine} open={dialog === "timer"} onClose={close} />
      <MoodCheckIns engine={engine} />
      <ExternalDialog engine={engine} />
    </>
  );
});
