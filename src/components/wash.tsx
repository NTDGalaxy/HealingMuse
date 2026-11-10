"use client";
import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";
import { artworkPalette } from "@/lib/artwork";
import type { Track } from "@/lib/types";
import { usePlayer } from "./player";

type Preview = Pick<Track, "id" | "color"> | null;
const SetPreview = createContext<(preview: Preview) => void>(() => {});

/**
 * The wash: the top of the screen wears the playing recording's artwork colours, or the
 * recording a route offers while nothing plays (Home offers its featured one), or the brand
 * lavender. The colours are registered properties, so a change cross-fades (tokens.css).
 */
export function WashProvider({ children }: { children: React.ReactNode }) {
  const [preview, setPreview] = useState<Preview>(null);
  return (
    <SetPreview.Provider value={setPreview}>
      <Wash preview={preview} />
      {children}
    </SetPreview.Provider>
  );
}

function Wash({ preview }: { preview: Preview }) {
  const { current } = usePlayer();
  const source = current ?? preview;
  const palette = artworkPalette(source?.color);
  return (
    <div
      className="wash"
      data-part="wash"
      data-state={current ? "playing" : preview ? "preview" : "idle"}
      aria-hidden="true"
      style={
        {
          "--wash-glow": palette.glow,
          "--wash-mid": palette.mid,
          "--wash-light": palette.light,
        } as CSSProperties
      }
    />
  );
}

/** Offers a recording's colours to the wash while nothing plays; withdrawn on unmount. */
export function useWashPreview(track: Preview) {
  const setPreview = useContext(SetPreview);
  const id = track?.id;
  const color = track?.color;
  useEffect(() => {
    setPreview(id ? { id, color: color as Track["color"] } : null);
    return () => setPreview(null);
  }, [setPreview, id, color]);
}
