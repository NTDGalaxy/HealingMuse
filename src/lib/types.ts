import type { z } from "zod";
import type { trackRecord, trackSource } from "./validation";

export type { Locale } from "./routes";
import type { Locale } from "./routes";
export type LocalizedText = Record<Locale, string>;
export type Goal = "relax" | "rest" | "focus";
/** Derived from the validation schema so the type and the runtime checks cannot drift. */
export type TrackSource = z.output<typeof trackSource>;
export type Track = z.output<typeof trackRecord>;

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
