export type Locale = "vi" | "en";
export type LocalizedText = Record<Locale, string>;
export type Goal = "relax" | "rest" | "focus";
export type TrackSource =
  | { kind: "hosted"; path: string }
  | { kind: "youtube"; videoId: string }
  | { kind: "spotify_link"; url: string };

export interface Track {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  artist: string;
  category: "instrumental" | "nature";
  goals: Goal[];
  genres?: string[];
  instruments?: string[];
  traditions?: string[];
  listeningReviewed?: boolean;
  duration: number;
  source: TrackSource;
  downloadAllowed: boolean;
  artwork: "forest" | "rain" | "sea" | "piano" | "river" | "night";
  color: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  provenanceUrl: string;
  status: "draft" | "published" | "retired";
  rightsVerified: boolean;
  humanCreated: boolean;
  position: number;
  bytes?: number;
  sha256?: string;
  changes?: string;
}

export interface CatalogPage {
  items: Track[];
  total: number;
  nextCursor: string | null;
}
export interface CatalogQuery {
  q?: string;
  goal?: string;
  category?: string;
  genre?: string;
  instrument?: string;
  tradition?: string;
  collection?: string;
  cursor?: string;
  limit?: number;
  status?: string;
}

export interface Profile {
  id: string;
  locale: Locale;
  calm_mode: boolean;
  mood_consent_at: string | null;
}
export interface CuratedCollection {
  id: string;
  title: LocalizedText;
  goal: Goal;
  trackIds: string[];
  revision: number;
  published: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  revision: number;
  trackIds: string[];
}

export interface MoodCheckin {
  id: string;
  session_id: string;
  phase: "before" | "after";
  score: number;
  created_at: string;
}

export interface PersonalData {
  profile: Profile;
  favorites: string[];
  playlists: Playlist[];
  checkins: MoodCheckin[];
  isAdmin: boolean;
}

export interface PlaybackGrant {
  url: string;
  expiresAt: string;
  sha256?: string;
  bytes?: number;
}

export interface DownloadedTrack {
  id: string;
  track: Track;
  blob: Blob;
  downloadedAt: string;
  bytes: number;
}

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "conflict"
  | "unavailable"
  | "rate_limited"
  | "consent_required"
  | "offline"
  | "storage_full";
