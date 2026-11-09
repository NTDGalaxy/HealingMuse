import type { Locale } from "./i18n";

// Every class name, id, data attribute, storage key and computed-style expectation the
// end-to-end suite depends on lives here. A redesign that renames markup edits this file,
// not the specs. Composite selectors are built from the tokens below so each name appears once.

const main = "#main-content";
const trackCard = ".track-card";
const cardPlay = ".card-play";
const featured = ".featured-recording";
const featuredVisible = `${featured}:visible`;
const moreRecordings = ".home-more-recordings";
const filterDetails = ".catalog-filter-details";
const binauralBackground = ".binaural-background";

/** The document element and the preferences it reflects before and after hydration. */
export const documentRoot = {
  selector: "html",
  lang: "lang",
  theme: "data-theme",
  garden: "data-garden",
} as const;

export const shell = {
  app: ".app-shell",
  calmClass: "calm-mode",
  main,
  mainHeading: `${main} h1`,
  mainCopy: `${main} p:visible`,
  skipLink: ".skip-link",
  topbar: ".topbar",
  sidebar: ".sidebar",
  sideNavLink: (href: string) => `.side-nav a[href="${href}"]`,
  mobileNav: ".mobile-nav",
  mobileNavButton: ".mobile-nav button",
  current: "data-current",
  languageLink: (locale: Locale) => `.language-switch a[lang="${locale}"]`,
  searchBox: ".search-box",
  downloadStatus: ".download-status",
  toast: ".toast",
  scenery: "#sanctuary-scenery",
  sceneryShift: "--scenic-shift",
  pageHeading: ".page-heading",
  emptyState: ".empty-state",
  panel: ".panel",
  /** Body copy and setting labels that must stay at a readable size. */
  readableText: "main p, .setting-row > span > span",
  focused: ":focus",
  children: ":scope > *",
} as const;

export const dialog = {
  role: '[role="dialog"]',
  content: ".dialog-content",
} as const;

export const status = '[role="status"]';

/** Performance marks the application records (src/lib/perf/readiness.ts). */
export const marks = {
  /** The Shell has preloaded the code of its on-demand dialogs. */
  onDemandReady: "hm:on-demand-ready",
} as const;

/** The personal-data endpoint the account store reads. */
export const personalDataPath = "/api/me";

export const garden = {
  host: ".garden-canvas",
  canvas: "canvas",
  hostCanvas: ".garden-canvas canvas",
  state: "data-state",
  quality: "data-quality",
  renderer: "data-renderer",
  /** Performance marks of the audio-first start (src/lib/perf/audio-first.ts). */
  sceneStartMark: "hm:scene-start",
  motionStartMark: "hm:motion-start",
} as const;

/** Local recordings served by the preview, for holding a recording while it starts. */
export const localAudioRoute = "**/api/local-audio/*";

/** Every emitted JavaScript chunk, for failing one that contains a given marker. */
export const chunkRoute = "**/_next/static/chunks/*.js";

/**
 * Strings that survive minification inside one emitted script chunk, to find that chunk in a
 * production build (the budget check uses the same markers).
 */
export const chunkMarkers = {
  /** Radix dialog, the code every dialog downloads on first use. */
  dialog: '"DialogContentModal"',
  /** The sign-in dialog (an element id it renders). */
  authDialog: '"auth-recovery-status"',
} as const;

export const card = {
  root: trackCard,
  className: trackCard.slice(1),
  visible: `${trackCard}:visible`,
  play: cardPlay,
  playLabel: ".card-play-label",
  title: ".track-title",
  description: ".track-description",
  descriptionText: ".track-description p",
  art: ".track-art",
  actionButton: ".track-actions button",
  actionIconButton: ".track-actions .icon-button",
  downloadedBadge: ".downloaded-badge",
  /** The featured recording wrapper, used to tell the first listening target from later ones. */
  featured,
  featuredCard: `${featuredVisible} ${trackCard}`,
  featuredPlay: `${featuredVisible} ${cardPlay}`,
  featuredActionButton: `${featuredVisible} .track-actions button`,
  moreCard: `${moreRecordings} ${trackCard}`,
  morePlayLabel: `${moreRecordings} .card-play-label`,
  mainPlay: `${main} ${cardPlay}`,
} as const;

export const player = {
  audio: "audio",
  /** The player's media element carrying a session mark set by `markListeningSession`. */
  markedAudio: (mark: string) => `audio[data-session="${mark}"]`,
  bar: ".player-bar",
  error: ".player-error",
  errorAlert: '.player-error[role="alert"]',
  currentTitle: ".player-bar .player-track strong",
  playButton: ".player-buttons .play-button",
  queueItem: ".queue-list button",
  currentQueueItem: '.queue-list button[aria-current="true"]',
} as const;

/** Streamed playback asks this endpoint for a short-lived URL; downloaded playback never does. */
export const playbackGrantPath = "/api/grants/";

export const explore = {
  filterChip: ".filter-chip",
  filterRow: ".filter-row",
  filterSummary: `${filterDetails} summary`,
  filterSummaryChild: `${filterDetails} > summary`,
  mainFilterSummary: `${main} ${filterDetails} summary`,
  facets: ".catalog-facets",
  mainFacets: `${main} .catalog-facets`,
  facet: (name: "genre" | "goal" | "instrument" | "tradition") => `#filter-${name}`,
  resultsNote: ".results-note",
  /** The results note of a lazily loaded list in the reading region, never a hidden streamed copy. */
  mainResultsNote: `${main} .results-note:visible`,
  pager: "fieldset",
  mainCategoryLink: (category: string) => `${main} a[href*="category=${category}"]`,
} as const;

export const binaural = {
  player: ".binaural-player",
  state: "data-state",
  buttons: ".binaural-buttons button",
  frequencies: ".binaural-frequencies",
  preset: "#binaural-preset",
  duration: "#binaural-duration",
  customDuration: "#binaural-custom-duration",
  volume: (channel: "master" | "tone" | "background") => `#binaural-${channel}Volume`,
  visualizerBar: ".binaural-visualizer i",
  advanced: ".binaural-advanced",
  mode: ".binaural-mode",
  selectedModeInput: ".binaural-mode.selected input",
  background: binauralBackground,
  backgroundCard: `${binauralBackground} ${trackCard}`,
  backgroundPlay: `${binauralBackground} ${cardPlay}`,
  range: ".binaural-range",
  selection: ".binaural-catalogue-selection",
  facet: (name: "genre" | "goal" | "instrument" | "tradition") => `#binaural-filter-${name}`,
} as const;

export const settings = {
  appearanceRow: ".appearance-controls .setting-row",
  rowLabel: "span",
  rowControl: "input",
  account: ".settings-account",
  privacy: ".settings-privacy",
  install: ".settings-install",
  accountDanger: ".settings-account .danger",
  actions: ".settings-actions",
} as const;

export const mood = {
  trends: ".mood-trends",
  scoreLabel: ".mood-scores label",
  scoreInput: (score: number) => `.mood-scores input[value="${score}"]`,
  selectedScoreInput: (score: number) => `.mood-scores label.selected input[value="${score}"]`,
} as const;

export const admin = {
  colorOption: (value: string) => `#admin-color option[value="${value}"]`,
  artworkOption: (value: string) => `#admin-artwork option[value="${value}"]`,
  statusPill: ".status-pill",
  releaseStatus: '.release-review [role="status"]',
  /** Provider names are product names rendered without translation. */
  storageProvider: { b2: "Backblaze B2" },
} as const;

export const button = {
  secondaryDanger: ".button.secondary.danger",
} as const;

/** Error and help ids linked to form fields through aria-describedby. */
export const describedBy = {
  newPassword: "password-help password-error",
  signInCode: "code-help auth-error",
} as const;

export const youtube = {
  frame: "iframe",
} as const;

/** The literal account deletion requires, compared by the server and the form. */
export const accountDeletionConfirmation = "DELETE";

export const storage = {
  appearance: "healingmuse-appearance-v1",
  calm: "healingmuse-calm",
  binauralPreferences: "healingmuse-binaural-preferences-v1",
  downloads: { name: "healingmuse-downloads", version: 1, store: "recordings" },
} as const;

/** Elements the GSAP garden motion reveals inside the main content. */
export const motionTargets = [
  ".home-discovery",
  trackCard,
  ".panel",
  ".empty-state",
  ".storage-panel",
  ".binaural-modes",
  ".binaural-player",
  ".binaural-preferences",
  ".binaural-education",
  ".legal-page",
  ".credit-list",
  ".garden-credits",
  ".info-panel",
]
  .map((target) => `${main} ${target}`)
  .join(", ");

/** Computed-style expectations for motion and translucent surfaces. */
export const style = {
  headingArrival: "heading-arrive",
  dialogArrival: "dialog-arrive",
  none: "none",
  translucent: /^rgba\(/,
  opaque: /^rgb\(/,
  reducedTransparency: { name: "prefers-reduced-transparency", value: "reduce" },
} as const;

/** Size rules from the design system: touch targets, readable copy and compact play labels. */
export const size = {
  touchTarget: 44,
  readableFont: 16,
  compactLabel: 24,
} as const;

/** Settings layout: panels sit side by side from `twoColumnMinWidth`, separated by `panelGap`. */
export const layout = {
  twoColumnMinWidth: 1100,
  panelGap: 24,
  /** The minimum space between the two buttons of a settings action group. */
  actionGap: 12,
} as const;

/** Prepared catalogue identity: media/prepared/catalog.json entries 0 and 1 (local and CI fixtures). */
export const preparedCatalogPath = "media/prepared/catalog.json";
export const recordings = {
  first: {
    id: "00000000-0000-4000-8000-000000000001",
    title: { en: "A quiet beginning", vi: "Một khoảng bình yên" },
  },
  second: {
    id: "00000000-0000-4000-8000-000000000002",
    title: { en: "Rain and forest birds", vi: "Mưa và tiếng chim trong rừng" },
  },
} as const;
/** A search term that matches exactly one prepared recording. */
export const uniqueSearchTerm = "woodland";

/** Data rendered by the component harness in tests/browser-fixtures/main.tsx. */
export const harness = {
  page: "tests/browser-fixtures/index.html",
  audioPage: "tests/browser-fixtures/binaural-audio.html",
  navigation: "Fixture screens",
  signIn: "Sign in",
  switchLanguage: "Switch language",
  /** Source modules the fixture's Vite server serves on demand, by request path. */
  modules: {
    adminConsole: "src/features/admin/admin-console.tsx",
    /** The synthetic stand-in for @/lib/supabase/client, the app's sign-in chunk. */
    authClient: "tests/browser-fixtures/auth.ts",
  },
  recording: {
    id: "00000000-0000-4000-8000-000000000001",
    title: { en: "Synthetic recording", vi: "Bản thu thử" },
  },
  secondRecording: {
    id: "00000000-0000-4000-8000-000000000002",
    title: { en: "Second synthetic recording", vi: "Bản thu thử hai" },
  },
  video: {
    id: "00000000-0000-4000-8000-000000000003",
    title: { en: "Synthetic video", vi: "Video thử" },
  },
} as const;
