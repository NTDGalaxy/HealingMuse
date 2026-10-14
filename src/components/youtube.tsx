"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface YouTubePlayer {
  destroy: () => void;
}
interface YouTubeApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: { events: { onReady: () => void; onError: () => void } },
  ) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let pendingApi: Promise<YouTubeApi> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pendingApi) return pendingApi;
  pendingApi = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("unavailable"));
    }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (window.YT) resolve(window.YT);
      else reject(new Error("unavailable"));
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("unavailable"));
    };
    document.head.append(script);
  }).catch((error) => {
    pendingApi = null;
    throw error;
  });
  return pendingApi;
}

/** Mount only after the listener explicitly agrees to load the visible external player. */
export function YouTubeEmbed({
  videoId,
  title,
  chooseAnother,
}: {
  videoId: string;
  title: string;
  chooseAnother: () => void;
}) {
  const t = useTranslations("catalog");
  const frame = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let player: YouTubePlayer | undefined;
    void loadApi()
      .then((api) => {
        if (!active || !frame.current) return;
        player = new api.Player(frame.current, {
          events: {
            onReady: () => {
              if (active) setLoading(false);
            },
            onError: () => {
              if (active) {
                setLoading(false);
                setFailed(true);
              }
            },
          },
        });
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setFailed(true);
        }
      });
    return () => {
      active = false;
      player?.destroy();
    };
  }, [videoId]);
  const origin = typeof location === "undefined" ? "" : location.origin;
  return (
    <>
      <iframe
        ref={frame}
        className="youtube-frame"
        title={title}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
      {loading && <p role="status">{t("youtubeLoading")}</p>}
      {failed && (
        <p className="error" role="alert">
          {t("youtubeUnavailable")}
        </p>
      )}
      <button className="button secondary" onClick={chooseAnother}>
        {t("chooseAnother")}
      </button>
    </>
  );
}
