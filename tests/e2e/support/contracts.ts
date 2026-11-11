import { revealTargets } from "../../../src/lib/garden/reveal-targets";
import { decorationMarks } from "../../../src/lib/perf/audio-first";
import { readinessMarks } from "../../../src/lib/perf/readiness";
import type { Locale } from "./i18n";

// Every markup hook, data attribute, storage key and computed-style expectation the end-to-end
// suite depends on lives here, so a redesign edits this file and the page objects, never the specs.
// Page objects prefer roles, labels and landmarks resolved through i18n.ts. Where no unique one
// exists, components carry a stable data-part attribute named for what the part is, and the
// selectors below name those parts. They never name a class or an id; tests/unit/
// e2e-conventions.test.ts enforces that.

/** The selector of an element carrying `data-part="<name>"`. */
const part = (name: string) => `[data-part="${name}"]`;

/** The main landmark, for CSS contexts (axe scopes, in-page probes) that cannot take a role. */
const main = "main";

/** The document element and the preferences it reflects before and after hydration. */
export const documentRoot = {
  selector: ":root",
  lang: "lang",
  theme: "data-theme",
  garden: "data-garden",
} as const;

export const shell = {
  app: part("app-shell"),
  /** The state class the Shell applies while Calm is on (no other markup reflects it). */
  calmClass: "calm-mode",
  main,
  sidebar: part("sidebar"),
  /** The legal links at the foot of the desktop sidebar. */
  sidebarLegal: part("sidebar-legal"),
  mobileNav: part("mobile-nav"),
  /** The text label under each phone tab's icon. */
  navLabel: part("nav-label"),
  current: "data-current",
  /** A link whose text is in `locale`, as every language switch marks it. */
  languageLink: (locale: Locale) => `[lang="${locale}"]`,
  searchField: part("search-field"),
  downloadStatus: part("download-status"),
  /** The visual notice; aria-hidden, because the live region announces the same text. */
  toast: part("toast"),
  scenery: part("scenery"),
  /** Set on the top bar while content is scrolled under it (the bar is glass only then). */
  scrolled: "data-scrolled",
  pageHeading: part("page-heading"),
  emptyState: part("empty-state"),
  /** The help line under a setting's name (body copy is found by role). */
  settingHelp: part("setting-help"),
  focused: ":focus",
  /** Focus a keyboard user can see, the state the focus ring belongs to. */
  focusVisible: ":focus-visible",
  children: ":scope > *",
  /** Every element of the page, to name what reaches past the viewport. */
  everyElement: "*",
} as const;

export const dialog = {
  /** Every open dialog surface (Radix renders its content with this role). */
  role: '[role="dialog"]',
} as const;

/** Performance marks the application records (src/lib/perf/readiness.ts). */
export const marks = {
  /** The route's primary control has hydrated, so keyboard and pointer input reach React. */
  primaryReady: readinessMarks.primary,
  /** The Shell has preloaded the code of its on-demand dialogs. */
  onDemandReady: readinessMarks.onDemand,
} as const;

/** The personal-data endpoint the account store reads. */
export const personalDataPath = "/api/me";

export const garden = {
  host: part("garden-host"),
  /** The WebGL canvas the garden renderer creates inside the host at runtime. */
  canvas: "canvas",
  state: "data-state",
  quality: "data-quality",
  renderer: "data-renderer",
  /** Performance marks of the audio-first start (src/lib/perf/audio-first.ts). */
  sceneStartMark: decorationMarks.scene,
  motionStartMark: decorationMarks.motion,
  motionLoadedMark: decorationMarks.motionLoaded,
  /** The GSAP layer's code failed to load for good, the chunk loader's own retry included. */
  motionUnavailableMark: decorationMarks.motionUnavailable,
} as const;

/** Local recordings served by the preview, for holding a recording while it starts. */
export const localAudioRoute = "**/api/local-audio/*";
/** Catalogue page requests, routed when a test needs a catalogue of its own. */
export const catalogRoute = "**/api/catalog?*";
/** The local catalogue's audio for one recording (preview mode, Range-capable). */
export const localAudioPath = (id: string) => `/api/local-audio/${id}`;

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
  root: part("track-card"),
  play: part("track-play"),
  /** The glyph inside Play; on a touch row cover it is the opaque jade badge. */
  playIcon: part("track-play-icon"),
  playLabel: part("track-play-label"),
  /** The check on the cover of a recording saved on this device. */
  downloaded: part("track-downloaded"),
  /** A card's own favourite button; a narrow line folds it into the details sheet. */
  favorite: '[data-action="favorite"]',
  title: part("track-title"),
  /** The text column: title, artist and the actions row. */
  description: part("track-description"),
  artist: part("track-artist"),
  art: part("track-art"),
  /** The row of favourite, download and details buttons. */
  actions: part("track-actions"),
  /** The featured recording wrapper, used to tell the first listening target from later ones. */
  featured: part("featured-recording"),
  /** Home's shelf of further recordings under the featured one. */
  more: part("more-recordings"),
} as const;

export const player = {
  /** The persistent player's media element, the only one in the document. */
  audio: "audio",
  /** The player's media element carrying a session mark set by `markListeningSession`. */
  markedAudio: (mark: string) => `[data-session="${mark}"]`,
  /** The persistent player bar, rendered (with display: none) even while nothing plays. */
  bar: part("player-bar"),
  currentTitle: part("player-title"),
  /** The queue entry of the recording that is playing. */
  current: '[aria-current="true"]',
} as const;

/** Streamed playback asks this endpoint for a short-lived URL; downloaded playback never does. */
export const playbackGrantPath = "/api/grants/";

export const explore = {
  /** The four facet selects inside the filter disclosure. */
  facets: part("catalog-facets"),
  /** Any link into one catalogue category. */
  categoryLink: (category: string) => `[href*="category=${category}"]`,
} as const;

export const binaural = {
  player: part("binaural-player"),
  state: "data-state",
  /** Start, pause or resume, and stop. */
  sessionControls: part("binaural-session-controls"),
  frequencies: part("binaural-frequencies"),
  visualizerBar: part("binaural-visualizer-bar"),
  /** The fine-tuning disclosure. */
  advanced: part("binaural-advanced"),
  /** Which recordings of the mixer catalogue the current page shows. */
  range: part("page-range"),
  /** The title of the chosen background recording. */
  selection: part("background-selection"),
} as const;

export const settings = {
  appearance: part("settings-appearance"),
  account: part("settings-account"),
  privacy: part("settings-privacy"),
  install: part("settings-install"),
  /** A row of two settings actions. */
  actions: part("settings-actions"),
  /** The name and help beside a setting's switch. */
  settingText: part("setting-text"),
} as const;

export const mood = {
  /** One choice of the five-step mood scale, with its symbol and text. */
  score: part("mood-score"),
  /** The control that deletes every check-in. */
  deleteHistory: part("delete-mood-history"),
} as const;

export const admin = {
  /** The publication status of a recording in the content studio list. */
  recordingStatus: part("recording-status"),
  /** The option of a select that has this value. */
  option: (value: string) => `[value="${value}"]`,
  /** Provider names are product names rendered without translation. */
  storageProvider: { b2: "Backblaze B2" },
} as const;

/** The literal the server requires to erase an account, whatever word the listener typed. */
export const accountDeletionConfirmation = "DELETE";

export const storage = {
  appearance: "healingmuse-appearance-v1",
  calm: "healingmuse-calm",
  binauralPreferences: "healingmuse-binaural-preferences-v1",
  downloads: { name: "healingmuse-downloads", version: 1, store: "recordings" },
} as const;

/**
 * Elements the GSAP garden motion reveals inside the main content, exactly as the motion layer
 * selects them, so the wait for motion to settle follows the application.
 */
export const motionTargets = revealTargets;

/** Computed-style expectations for motion and translucent surfaces. */
export const style = {
  headingArrival: "heading-arrive",
  dialogArrival: "dialog-arrive",
  none: "none",
  /** A colour with an alpha below one, in legacy (rgba) or modern (oklab, color) serialization. */
  translucent: /^(rgba\(.+, 0?\.\d+\)|[a-z]+\(.+ \/ 0?\.\d+\))$/,
  opaque: /^rgb\(/,
  /** A fully transparent fill: nothing painted over what lies beneath. */
  transparent: "rgba(0, 0, 0, 0)",
  /** The opacity of a control that is shown but cannot be used. */
  dimmed: "0.5",
  reducedTransparency: { name: "prefers-reduced-transparency", value: "reduce" },
} as const;

/** Size rules from the design system: touch targets, readable copy and compact play labels. */
export const size = {
  touchTarget: 44,
  readableFont: 16,
  compactLabel: 24,
  /** The cover of a recording line: a phone list row or a row on Home. */
  lineCover: 56,
  /** The least room a recording line gives its name, however narrow the line. */
  lineTitleMin: 140,
  /** The least space between two phone tab labels, so each reads as its own word (bold labels
   * leave 4 px between the Vietnamese tabs at 320 and 360 px, regular ones about 9). */
  tabLabelGap: 8,
  /** A sidebar destination's row: one line of 16 px text, so taller means its name wrapped. */
  sideNavItem: 48,
} as const;

/** Settings layout: panels sit side by side from `twoColumnMinWidth`, separated by `panelGap`. */
export const layout = {
  /** Phone layouts, such as a grid of recordings read as lines, apply up to this width. */
  phoneMaxWidth: 600,
  /** From this width Home sets its featured cover beside the name, with up next below. */
  featuredBesideMinWidth: 700,
  /** From this width Home's up next moves beside the featured cover, under the name. */
  featuredColumnMinWidth: 1024,
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
