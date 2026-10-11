import type { Track } from "@/lib/types";

/** Photographs and transformation credits are retained in content/artwork-credits.json. */
export function NatureArt({
  kind = "forest",
  label,
  className = "",
}: {
  kind?: Track["artwork"];
  color?: string;
  label?: string;
  className?: string;
}) {
  // Locally hosted photographs have fixed dimensions and need no external image requests.
  return (
    <img
      className={`nature-art ${className}`}
      src={`/artwork/${kind}.webp`}
      width={800}
      height={600}
      alt={label || ""}
      loading="lazy"
      decoding="async"
    />
  );
}
