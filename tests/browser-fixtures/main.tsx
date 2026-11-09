// First, so the session cookie is in place before the app decides whether to load the client.
import "./synthetic-session";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import { AppProvider, useApp } from "@/components/app-state";
import { PlayerProvider } from "@/components/player";
import { LibraryView } from "@/features/library/library-view";
import { MoodView } from "@/features/mood/mood-view";
import { SettingsView } from "@/features/settings/settings-view";
import { AdminView } from "@/features/admin/admin-view";
import { AuthDialog } from "@/features/account/auth-dialog";
import { PasswordResetView } from "@/features/account/password-reset";
import { AppearanceProvider } from "@/components/appearance";
import { TrackCard, ExploreView } from "@/components/catalog";
import type { Track, CatalogPage, CatalogQuery } from "@/lib/types";
import "@/styles";

const track: Track = {
  id: "00000000-0000-4000-8000-000000000001",
  title: { vi: "Bản thu thử", en: "Synthetic recording" },
  description: { vi: "Dữ liệu thử nghiệm", en: "Synthetic fixture only" },
  artist: "Synthetic fixture",
  category: "nature",
  goals: ["relax"],
  genres: [],
  instruments: [],
  traditions: [],
  listeningReviewed: true,
  duration: 60,
  source: { kind: "hosted", path: "synthetic.mp3" },
  downloadAllowed: true,
  artwork: "forest",
  color: "sage",
  attribution: "Synthetic fixture only",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  provenanceUrl: "https://example.invalid",
  status: "published",
  rightsVerified: true,
  humanCreated: true,
  position: 0,
};
const tracks: Track[] = [
  track,
  {
    ...track,
    id: "00000000-0000-4000-8000-000000000002",
    title: { vi: "Bản thu thử hai", en: "Second synthetic recording" },
  },
  {
    ...track,
    id: "00000000-0000-4000-8000-000000000003",
    title: { vi: "Video thử", en: "Synthetic video" },
    source: { kind: "youtube", videoId: "abcdefghijk" },
    downloadAllowed: false,
  },
];
function CatalogueFixture() {
  const [query, setQuery] = useState<CatalogQuery>({});
  const [page, setPage] = useState<CatalogPage>({ items: [], total: 0, nextCursor: null });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let controller: AbortController;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const params = new URLSearchParams(location.search);
      params.delete("locale");
      const query = Object.fromEntries(params);
      setQuery(query);
      void fetch(`/api/catalog?${params}`, { signal: current.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const data = await response.json();
          if (!current.signal.aborted) {
            setPage(data);
            setUnavailable(false);
          }
        })
        .catch(() => {
          if (!current.signal.aborted) setUnavailable(true);
        });
    };
    load();
    window.addEventListener("healingmuse-fixture-route", load);
    window.addEventListener("popstate", load);
    return () => {
      controller?.abort();
      window.removeEventListener("healingmuse-fixture-route", load);
      window.removeEventListener("popstate", load);
    };
  }, []);
  return <ExploreView query={query} initialPage={page} unavailable={unavailable} />;
}
function Views({ switchLocale }: { switchLocale: () => void }) {
  const [view, setView] = useState("library");
  const app = useApp();
  return (
    <>
      <header>
        <nav aria-label="Fixture screens">
          {[
            "library",
            "mood",
            "settings",
            "admin",
            "recording",
            "browse",
            "catalogue",
            "password",
          ].map((name) => (
            <button className="button secondary" key={name} onClick={() => setView(name)}>
              {name}
            </button>
          ))}
          <button className="button" onClick={app.openAuth}>
            Sign in
          </button>
          <button className="button secondary" onClick={switchLocale}>
            Switch language
          </button>
        </nav>
      </header>
      <main style={{ paddingBottom: 260 }}>
        {view === "library" ? (
          <LibraryView />
        ) : view === "mood" ? (
          <MoodView />
        ) : view === "settings" ? (
          <SettingsView />
        ) : view === "admin" ? (
          <AdminView />
        ) : view === "password" ? (
          <PasswordResetView />
        ) : view === "catalogue" ? (
          <CatalogueFixture />
        ) : view === "browse" ? (
          <TrackCard
            track={track}
            queue={[track]}
            continuation={{ cursor: "synthetic-next", limit: 24 }}
          />
        ) : (
          <div className="track-grid">
            {tracks.map((track) => (
              <TrackCard track={track} key={track.id} />
            ))}
          </div>
        )}
      </main>
      <AuthDialog />
    </>
  );
}
const initialLocale = new URL(location.href).searchParams.get("locale") === "vi" ? "vi" : "en";
// Mirrors Application: a language switch swaps messages without remounting the providers.
function Root() {
  const [locale, setLocale] = useState<"vi" | "en">(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "vi" ? vi : en}
      timeZone="Asia/Ho_Chi_Minh"
    >
      <AppearanceProvider>
        <AppProvider tracks={tracks} collections={[]}>
          <PlayerProvider>
            <Views switchLocale={() => setLocale(locale === "vi" ? "en" : "vi")} />
          </PlayerProvider>
        </AppProvider>
      </AppearanceProvider>
    </NextIntlClientProvider>
  );
}
document.documentElement.lang = initialLocale;
createRoot(document.getElementById("root")!).render(<Root />);
