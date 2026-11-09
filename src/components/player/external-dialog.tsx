"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { Locale } from "@/lib/types";
import { useStore } from "@/lib/state/create-store";
import type { ExternalRequest, PlaybackEngine } from "@/lib/playback/engine";
import { Dialog } from "../dialog";
import { YouTubeEmbed } from "../youtube";

/** External recordings play on their own service, visibly and only after explicit consent. */
export function ExternalDialog({ engine }: { engine: PlaybackEngine }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const external = useStore(engine.state, (state) => state.external);
  // Consent to load the embed belongs to one request; every request is a new object.
  const [consented, setConsented] = useState<ExternalRequest | null>(null);
  const youtubeLoaded = !!external && consented === external;
  const track = external?.track;
  return (
    <Dialog
      open={!!external}
      onOpenChange={engine.closeExternal}
      title={track?.title[locale] ?? t("catalog.details")}
      description={t("catalog.youtubeVisible")}
      wide
    >
      {track?.source.kind === "youtube" && (
        <>
          {!youtubeLoaded ? (
            <>
              <p>{t("catalog.youtubeNotice")}</p>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("catalog.googlePrivacy")}
              </a>
              <button className="button" onClick={() => setConsented(external)}>
                {t("catalog.youtubeStart")}
              </button>
            </>
          ) : (
            <YouTubeEmbed
              videoId={track.source.videoId}
              title={track.title[locale]}
              chooseAnother={engine.closeExternal}
            />
          )}
          <a
            className="button secondary"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.youtube.com/watch?v=${track.source.videoId}`}
          >
            {t("catalog.openYoutube")}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </>
      )}
      {track?.source.kind === "spotify_link" && (
        <a className="button" href={track.source.url} target="_blank" rel="noopener noreferrer">
          {t("catalog.spotify")}
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      )}
    </Dialog>
  );
}
