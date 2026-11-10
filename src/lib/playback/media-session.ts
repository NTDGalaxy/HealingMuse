// Media Session wiring shared by the catalogue player and the binaural session: lock screens,
// headsets and notification controls call these handlers.

export type MediaActions = Partial<Record<MediaSessionAction, MediaSessionActionHandler>>;

/**
 * Installs action handlers, skipping the actions this device does not support, and returns a
 * cleanup that removes them again.
 */
export function setMediaActions(session: MediaSession, actions: MediaActions): () => void {
  const names = Object.keys(actions) as MediaSessionAction[];
  for (const name of names) {
    try {
      session.setActionHandler(name, actions[name] ?? null);
    } catch {
      /* The device does not support this action. */
    }
  }
  return () => {
    for (const name of names) {
      try {
        session.setActionHandler(name, null);
      } catch {
        /* The device does not support this action. */
      }
    }
  };
}

export type TransportControls = {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  seekTo(seconds: number): void;
  /** Moves by a signed number of seconds, clamped to the recording. */
  seekBy(seconds: number): void;
};

/** The default skip distance when the platform does not give one. */
export const defaultSeekOffset = 10;

/** The handlers the catalogue player offers, in the order they are installed. */
export function transportActions(controls: TransportControls): MediaActions {
  return {
    play: () => controls.play(),
    pause: () => controls.pause(),
    previoustrack: () => controls.previous(),
    nexttrack: () => controls.next(),
    seekto: (details) => {
      if (details.seekTime !== undefined) controls.seekTo(details.seekTime);
    },
    seekbackward: (details) => controls.seekBy(-(details.seekOffset ?? defaultSeekOffset)),
    seekforward: (details) => controls.seekBy(details.seekOffset ?? defaultSeekOffset),
  };
}
