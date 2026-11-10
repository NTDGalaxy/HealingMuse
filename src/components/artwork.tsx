"use client";
import { memo, useId } from "react";
import { artworkGeometry, artworkPalette } from "@/lib/artwork";
import type { Track } from "@/lib/types";

/**
 * A recording's generated cover (src/lib/artwork.ts): two light fields over its deep colour and
 * the line work of its family, drawn as one inline SVG with no image request. Decorative unless a
 * label is given; the line weight stays constant at every size.
 */
export const Artwork = memo(function Artwork({
  track,
  label,
  className = "",
}: {
  track: Pick<Track, "id" | "artwork" | "color">;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const palette = artworkPalette(track.color);
  const { fields, paths, dots } = artworkGeometry(track.id, track.artwork);
  return (
    <svg
      className={`artwork ${className}`}
      data-part="artwork"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${uid}m`}>
          <stop offset="0" stopColor={palette.mid} stopOpacity="0.95" />
          <stop offset="1" stopColor={palette.mid} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}l`}>
          <stop offset="0" stopColor={palette.light} stopOpacity="0.7" />
          <stop offset="1" stopColor={palette.light} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={palette.deep} />
      <circle cx={fields[0].x} cy={fields[0].y} r={fields[0].r} fill={`url(#${uid}m)`} />
      <circle cx={fields[1].x} cy={fields[1].y} r={fields[1].r} fill={`url(#${uid}l)`} />
      <g className="artwork-lines" fill="none" stroke={palette.light} strokeLinecap="round">
        {paths.map((d, index) => (
          <path key={index} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {dots.length > 0 && (
        <g fill={palette.light}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
        </g>
      )}
    </svg>
  );
});
