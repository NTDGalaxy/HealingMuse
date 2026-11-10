"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { Locale } from "@/lib/types";
import { useStore } from "@/lib/state/create-store";
import type { ExternalRequest, PlaybackEngine } from "@/lib/playback/engine";
import { Dialog } from "../dialog";

type Embed = typeof import("../youtube").YouTubeEmbed;

/**
 * Loads the YouTube embed module only when a YouTube recording is played, so it never ships in
 * startup JavaScript. Loading starts when the dialog opens, before consent, because the module
 * is first-party code that contacts nobody until it mounts. A failed load (offline) is shown
 * as unavailable and retried on the next request instead of breaking the page.
 */
function useYouTubeEmbed(request: ExternalRequest | null) {
  const [embed, setEmbed] = useState<{ Component: Embed } | null>(null);
  const [failed, setFailed] = useState<ExternalRequest | null>(null);
  const wanted = request?.track.source.kind === "youtube" ? request : null;
  useEffect(() => {
    if (embed || !wanted) return;
    let active = true;
    import("../youtube").then(
      (module) => {
        if (active) setEmbed({ Component: module.YouTubeEmbed });
      },
      () => {
        if (active) setFailed(wanted);
      },
    );
    return () => {
      active = false;
    };
  }, [embed, wanted]);
  return { YouTubeEmbed: embed?.Component ?? null, failed: !!wanted && failed === wanted };
}

/** External recordings play on their own service, visibly and only after explicit consent. */
export function ExternalDialog({ engine }: { engine: PlaybackEngine }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const external = useStore(engine.state, (state) => state.external);
  // Consent to load the embed belongs to one request; every request is a new object.
  const [consented, setConsented] = useState<ExternalRequest | null>(null);
  const youtubeLoaded = !!external && consented === external;
  const track = external?.track;
  const { YouTubeEmbed, failed } = useYouTubeEmbed(external);
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
          ) : YouTubeEmbed ? (
            <YouTubeEmbed
              videoId={track.source.videoId}
              title={track.title[locale]}
              chooseAnother={engine.closeExternal}
            />
          ) : (
            <>
              {failed ? (
                <p className="error" role="alert">
                  {t("catalog.youtubeUnavailable")}
                </p>
              ) : (
                <p role="status">{t("catalog.youtubeLoading")}</p>
              )}
              <button className="button secondary" onClick={engine.closeExternal}>
                {t("catalog.chooseAnother")}
              </button>
            </>
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
