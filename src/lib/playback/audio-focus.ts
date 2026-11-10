// Ordinary playback and the one other audio source (the binaural session) pause each other.
// The other source registers how to pause it; the player pauses it before making sound, and
// the other source calls the player's pauseForOtherAudio before it starts.

export type AudioFocus = {
  /** Registers the other audio's pause. The cleanup only removes this registration. */
  register(pause: () => void): () => void;
  /** Pauses the other audio, if one is registered. */
  pauseOther(): void;
};

export function createAudioFocus(): AudioFocus {
  let other: (() => void) | null = null;
  return {
    register(pause) {
      other = pause;
      return () => {
        if (other === pause) other = null;
      };
    },
    pauseOther() {
      other?.();
    },
  };
}
