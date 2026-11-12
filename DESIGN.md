---
name: HealingMuse
description: A night-mode music app where the playing recording's artwork colours the room, with a lavender-white day twin.
colors:
  bg-night: "#12091a"
  surface-night: "#1a1026"
  surface-2-night: "#241635"
  surface-3-night: "#2e1d44"
  line-night: "#3a2850"
  line-strong-night: "#8676a0"
  text-night: "#f4eefb"
  muted-night: "#bcafd0"
  lav-night: "#cbb8f2"
  on-lav-night: "#1c0f27"
  lav-glow-night: "#cbb8f240"
  lav-tint-night: "#2e2045"
  jade-night: "#3fe0b5"
  on-jade-night: "#052a20"
  jade-ink-night: "#6ff0cb"
  jade-glow-night: "#3fe0b559"
  focus-night: "#e6d8ff"
  danger-night: "#ff9e8c"
  danger-tint-night: "#3a1720"
  on-danger-night: "#2a0d08"
  shadow-night: "#05020acc"
  scrim-night: "#05020ab3"
  bg-day: "#f5f1fa"
  surface-day: "#fdfbff"
  surface-2-day: "#efe8f8"
  surface-3-day: "#e6dcf3"
  line-day: "#dcd0ea"
  line-strong-day: "#8a7aa0"
  text-day: "#1c0f27"
  muted-day: "#5a4a6c"
  lav-day: "#6a4db2"
  on-lav-day: "#ffffff"
  lav-glow-day: "#6a4db22e"
  lav-tint-day: "#e7defa"
  jade-day: "#0b7f63"
  on-jade-day: "#ffffff"
  jade-ink-day: "#086f56"
  jade-glow-day: "#0b7f6333"
  focus-day: "#6a4db2"
  danger-day: "#a63a2b"
  danger-tint-day: "#fbe6e1"
  on-danger-day: "#ffffff"
  shadow-day: "#2a144026"
  scrim-day: "#1c0f2799"
  wash-glow: "#c9b6f0"
  wash-mid: "#8d6bdc"
  wash-light: "#dccbff"
typography:
  display:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.875rem, 1.2rem + 2.6vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline-lg:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 1.1rem + 2.2vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline-md:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title-lg:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title-md:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
    fontFeature: "'kern'"
  ui:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.55
  button:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  button-lg:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
  label:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.2
  label-time:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "'tnum'"
rounded:
  card: "16px"
  art: "12px"
  field: "12px"
  art-sm: "10px"
  dialog: "20px"
  focus: "6px"
  pill: "999px"
  round: "50%"
spacing:
  gutter: "40px"
  gutter-laptop: "28px"
  gutter-mobile: "20px"
  gutter-narrow: "16px"
  panel: "24px"
  panel-mobile: "20px"
  dialog: "28px"
  section: "56px"
  section-mobile: "44px"
components:
  button-filled:
    backgroundColor: "{colors.lav-night}"
    textColor: "{colors.on-lav-night}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-listen:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-listen-session:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "56px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-night}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2-night}"
  button-danger:
    backgroundColor: "{colors.danger-night}"
    textColor: "{colors.on-danger-night}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  play-hero:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0 26px 0 9px"
    height: "64px"
  play-hero-phone:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0 26px 0 9px"
    height: "56px"
  play-tile:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    rounded: "{rounded.round}"
    size: "52px"
  play-player:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    rounded: "{rounded.round}"
    size: "52px"
  play-player-mobile:
    backgroundColor: "{colors.jade-night}"
    textColor: "{colors.on-jade-night}"
    rounded: "{rounded.round}"
    size: "48px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-night}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    size: "48px"
  icon-button-hover:
    backgroundColor: "{colors.surface-2-night}"
  icon-button-pressed:
    textColor: "{colors.jade-ink-night}"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-night}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  filter-chip-selected:
    backgroundColor: "{colors.lav-tint-night}"
    textColor: "{colors.text-night}"
  category-link:
    backgroundColor: "{colors.surface-2-night}"
    textColor: "{colors.text-night}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  status-pill:
    backgroundColor: "{colors.surface-3-night}"
    textColor: "{colors.text-night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  field:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
    height: "48px"
  search-box:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    rounded: "{rounded.pill}"
    padding: "4px 4px 4px 18px"
    height: "56px"
  switch-on:
    backgroundColor: "{colors.lav-night}"
    width: "52px"
    height: "30px"
  panel:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel}"
  info-panel:
    backgroundColor: "{colors.surface-2-night}"
    textColor: "{colors.text-night}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel}"
  choice-card:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
    height: "88px"
  choice-card-selected:
    backgroundColor: "color-mix(in oklab, #cbb8f2 14%, #1a1026)"
  track-row:
    rounded: "{rounded.art}"
    padding: "8px"
    height: "72px"
  track-feature-art:
    rounded: "{rounded.card}"
    width: "460px"
  side-nav-link:
    textColor: "{colors.muted-night}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "48px"
  side-nav-link-current:
    backgroundColor: "{colors.surface-3-night}"
    textColor: "{colors.text-night}"
  mobile-nav:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.muted-night}"
    typography: "{typography.label}"
    height: "68px"
  player-bar:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    padding: "0 20px"
    height: "88px"
  player-bar-mobile:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    padding: "8px 12px"
    height: "64px"
  dialog:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.text-night}"
    rounded: "{rounded.dialog}"
    padding: "{spacing.dialog}"
    width: "min(520px, calc(100vw - 32px))"
  toast:
    backgroundColor: "{colors.text-night}"
    textColor: "{colors.bg-night}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "12px 18px"
---

# Design System: HealingMuse

## Overview

**Creative North Star: "The Record Lights the Room"**

HealingMuse is the music app listeners already know, after dark.
One recording's generated artwork owns the top of the screen, and its colours wash the surface behind the content and re-tint the route's 3D light scene.
Tap Play and the whole screen takes on that recording's colours, and they follow the listener to every route while it plays.
The ground is a plum night with a lavender-white day twin.
Both themes are first-class, and the app follows the device setting by default.

Density is a listening app's: a view leads with one recording at full size, then rows and rails of smaller artwork follow at a calm, readable rhythm.
Lavender carries structure (links, the filled button, selection, focus), and a single neon jade is spent only on listening, where it also glows.
Type is one family, Be Vietnam Pro: bold recording names, muted metadata, tabular times.
Surfaces are opaque and tonal, and glass appears only on the scrolled top bar and the dialog veil.

Motion has three owners.
CSS owns press feedback and the arrival of headings, disclosures and dialogs, which move but never fade text.
GSAP owns content reveals, and the scene owns slow ambient light; nothing moves with the beat.
Calm, reduced motion and reduced transparency each end in a still, opaque state.
This world replaces the botanical garden world outright, and it refuses both the pastel wellness card stack and the neon-on-black streaming wall.

**The Still Ending Rule.** Every preference that asks for less ends somewhere defined.
Calm and reduced motion remove every animation, transition and press scale, Calm also reaches dialogs portaled outside the shell, and the wash then changes colour at once instead of cross-fading.
Reduced transparency turns the top bar, dialogs, the player and the mobile navigation into solid surfaces and the dialog veil into the solid ground.

**Key Characteristics:**
- Generated, deterministic artwork for every recording: a deep field, two light fields and one family's line work, with no photographs.
- The wash: the playing recording's palette over the top of the screen, cross-fading in 600 ms.
- One neon jade, spent only on listening.
- Lavender for every structural accent and for focus.
- Plum-night and lavender-white grounds stepped into three tonal surfaces.
- Pills for controls, round transport Play, 16 px cards, 12 px artwork and fields.
- 48 px primary targets, a 3 px focus ring and a 14 px text floor.

## Colors

A plum-and-lavender ground in two twins, one structural lavender, one listening jade, and colour borrowed from the playing recording.

Every role exists twice: the frontmatter keys ending in `-night` and `-day` are the two themes, and the theme swaps the whole set at once.
Every text colour (text, muted, lavender, jade ink, danger) passes WCAG AA at 4.5:1 or better on bg, surface, surface-2 and surface-3 in both themes.
Control boundaries (line-strong) hold at least 3:1 against the ground and the surface in both themes.

### Primary

- **Listening Jade** (`#3fe0b5` night, `#0b7f63` day): fills the Play control on recording tiles and rows, the featured recording's labelled Listen pill, the player's Play button, the binaural Start button, progress and range fills, the playing ring and glow, and the logo mark.
  It also fills two small listening badges: the downloaded mark on artwork and the sleep timer's minute count.
- **On Jade** (`#052a20` night, `#ffffff` day): icons and labels on jade fills.
- **Jade Ink** (`#6ff0cb` night, `#086f56` day): the text-safe jade for things that are on: the loaded recording's name and duration wherever it is listed, pressed toggles (favourite, repeat, mute), the current queue item and the sidebar note's icon.
- **Jade Glow** (`#3fe0b559` night, `#0b7f6333` day): the soft halo under Play controls on hover and under the player's Play while it plays.

### Secondary

- **Structure Lavender** (`#cbb8f2` night, `#6a4db2` day): links, the filled button, text buttons, the switch's on state, selected choice-card borders, the current navigation icon, empty-state and mood symbols, the browser's accent and caret colour.
- **On Lavender** (`#1c0f27` night, `#ffffff` day): labels on the filled button and the switch knob when on.
- **Lavender Tint** (`#2e2045` night, `#e7defa` day): selected filter chips, text selection and playlist icon wells.
- **Lavender Glow** (`#cbb8f240` night, `#6a4db22e` day): the hover halo under filled buttons.
- **Focus Lavender** (`#e6d8ff` night, `#6a4db2` day): the 3 px focus ring; at night it lifts to a near-white lavender so it reads over jade and artwork.

### Tertiary

- **Borrowed Palette** (wash-glow, wash-mid, wash-light): the colour of whichever recording plays, or the one a route offers while nothing plays (Home offers its featured recording), or the brand lavender when neither applies.
  The three frontmatter values are the lavender defaults registered in the token file.
  They come from the recording's artwork palette in `src/lib/artwork.ts`, five palettes of light, mid, deep and glow:

| Palette | Light | Mid | Deep | Glow |
| --- | --- | --- | --- | --- |
| Lavender | `#dccbff` | `#8d6bdc` | `#2a1744` | `#c9b6f0` |
| Sage (jade) | `#b8f4e1` | `#2bb08e` | `#0e2c27` | `#3fe0b5` |
| Blue | `#c6d6ff` | `#5a79de` | `#151b3e` | `#8fb0ff` |
| Rose | `#ffd2e3` | `#d6649a` | `#3a1231` | `#ff9cc4` |
| Sand (dusk mauve) | `#f2d8ec` | `#ae729c` | `#2b1530` | `#e6a8d1` |

Lavender, plum and jade lead; blue and rose are the two secondary hues the brand allows, and sand sits between lavender and rose.

### Neutral

- **Plum Night Ground** (`#12091a`) and **Lavender-White Ground** (`#f5f1fa`): the page ground, and also the 3D scene's background and fog colour so the scene dissolves into the page.
- **Surface** (`#1a1026` night, `#fdfbff` day): the sidebar, player bar, mobile navigation, panels, dialogs and fields.
- **Surface 2** (`#241635` night, `#efe8f8` day): hover fills, info panels, empty states, notes, category links and the download status card.
- **Surface 3** (`#2e1d44` night, `#e6dcf3` day): the current navigation pill, status pills, artwork placeholders, progress tracks and the switch's off track.
- **Hairline** (`#3a2850` night, `#dcd0ea` day): 1 px borders on panels, the sidebar edge, the player and navigation top edges, table rules and dividers.
- **Control Boundary** (`#8676a0` night, `#8a7aa0` day): the 1.5 px border of anything the listener operates (fields, outlined buttons, chips, the search box, the switch).
- **Ink** (`#f4eefb` night, `#1c0f27` day) and **Muted Ink** (`#bcafd0` night, `#5a4a6c` day): primary text, and metadata, ledes, inactive navigation and captions.
- **Plum Shadow** (`#05020acc` night, `#2a144026` day): the only shadow colour for floating surfaces.
- **Scrim** (`#05020ab3` night, `#1c0f2799` day): the dialog veil.

### Status

- **Danger** (`#ff9e8c` night, `#a63a2b` day) with **On Danger** and **Danger Tint** (`#3a1720` night, `#fbe6e1` day): destructive buttons, invalid field borders, error text and the player's error strip.

### Named Rules

**The Listening Jade Rule.** Jade fills only listening: Play controls, listening progress, the playing state, the logo mark and the two small listening badges, and it glows only on Play and the playing state.
Generic filled buttons, switches, chips and selections are lavender.

**The Borrowed Colour Rule.** Colour beyond lavender, plum and jade comes only from the playing or offered recording's artwork palette, and only through the artwork, the wash and the scene tint.
It never colours text or a control.

**The Twin Rule.** Every colour role is defined for both themes and swaps as a set, so no surface is designed for one theme only.

## Typography

**Display Font:** Be Vietnam Pro (with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Be Vietnam Pro (same stack)
**Label/Mono Font:** Be Vietnam Pro with tabular numerals for times and counts

Be Vietnam Pro is self-hosted from Fontsource in its Vietnamese and Latin subsets at two weights only: regular (400) and bold (700).

**Character:** One family carries everything: tight, bold recording names that read like a music app's, and calm 16 px body text for tired eyes.
Hierarchy comes from weight and size, never from a second face.

### Hierarchy

- **Display** (700, clamp(1.875rem, 1.2rem + 2.6vw, 3.25rem), 1.08, -0.025em): the featured recording's name, the largest text on any view.
- **Headline Large** (700, clamp(1.75rem, 1.1rem + 2.2vw, 2.75rem), 1.15, -0.025em): route page titles and the not-found title.
- **Headline Medium** (700, clamp(1.625rem, 1.2rem + 1.4vw, 2.25rem), 1.15, -0.02em): the default page title size; Home uses it on desktop so the featured recording's name leads, and on phones Home's page title is visually hidden but stays for assistive technology, so the recording's name leads alone.
- **Title Large** (700, 1.375rem, 1.15, -0.02em): section titles, dialog titles and binaural frequency values.
- **Title Medium** (700, 1.125rem, 1.15, -0.02em): minor headings, and page ledes set in muted ink.
- **Body** (400, 1rem, 1.55): running text, capped at 68ch; reading pages open the line height to 1.7.
- **UI** (700, 1rem): navigation links, chips, field labels and setting names, and recording names in rows and tiles.
- **Button** (700, 1rem, 1.2): every pill button; the hero Play and the binaural Start step up to 1.125rem.
- **Label** (400, 0.875rem): metadata, durations, seek times, counts, notes, captions and the phone tab labels, in muted ink; the current tab takes full ink and its icon pill.

Headings balance their lines and paragraphs avoid orphans.
Large headings tighten to -0.02em or -0.025em; body and labels keep normal tracking.
The wordmark sets "Healing" in ink and "Muse" in lavender at 19 px, 700, -0.02em.

### Named Rules

**The Two Weights Rule.** Type uses regular (400) and bold (700), nothing between.
Bold names and acts: headings, titles, recording names, buttons, links, chips, sidebar and More navigation, field labels, errors and status lines.
Regular reads and measures: running text, metadata, durations, times, counts and notes.
The phone tab labels are the one regular navigation: at 13-14 px five bold labels leave 4 px between the Vietnamese tabs at 320 and 360 px, regular ones about 9 px, so the current tab is marked by ink and its icon pill instead.
A third weight adds two font files (a Vietnamese and a Latin subset, about 35 KiB) to every route, ahead of the code listening needs, so it is never worth it; `tests/unit/typography.test.ts` enforces the rule.
The offline shell ships only the regular face, and its bold is synthesized.

**The Bold Name Rule.** A recording is always named in weight 700, and in rows its name may take two lines before it truncates.
Artists and metadata step down to muted ink, never the other way round.

**The 14 px Floor Rule.** No text is smaller than 0.875rem (14 px).
The single exception is the five mobile tab labels, which drop to 0.8125rem (13 px) at 360 px and narrower so they stay on one line in Vietnamese.

**The Tabular Time Rule.** Durations, seek times, counts, volume values and frequencies use tabular numerals so they never jitter as they change.

## Layout

Desktop is a three-part frame: a fixed sidebar on the left (248 px, 216 px at 1100 px and below), a main column with a sticky top bar (64 px), and the docked player across the full width at the bottom (88 px) once a recording is loaded.
Content in the main column caps at 1280 px plus gutters, with gutters of 40 px, 28 px at 1100 px and below, 20 px at 900 px and below, and 16 px at 380 px and below.
At 900 px and below the sidebar disappears, the top bar shrinks to 60 px and carries the logo, and a fixed mobile navigation (68 px plus the safe area) docks at the bottom with four destinations and More in five equal columns.
The mini player (72 px token, at least 64 px tall) docks directly on top of that navigation as one opaque block.
The sidebar shortens and the main column pads for the player only while the player is shown, a rule set on the document because the player renders beside the shell.

The page fills the space beside the sidebar with no content cap, and the top bar shares its gutters, so the page's edges and the top bar's controls meet on every screen; the owner chose filling over a centred or left-aligned column on 2026-11-12.
What reads or is operated keeps its own width instead: fields grow to 32rem at most, a setting's name and its control share that width, reading pages cap at 760 px, the Mood history at 64rem, and Explore's search, kinds and filters form one block of at most 880 px.
Beside the sidebar (above 900 px) the document keeps a stable scrollbar gutter, so the page and the top bar never shift sideways between a page that scrolls and one that does not; phones and tablets draw overlay scrollbars that take no width.

The top of every route belongs to the scene and the wash: a fixed band from the sidebar edge to the right, min(82vh, 780px) tall, or min(72vh, 600px) at 900 px and below.
Content scrolls over it and the band fades to the solid ground before the fold.

The featured recording is the main composition.
From 700 px the artwork sits beside its name: a column of minmax(280px, 360px) on the left, the name, metadata and Play centred against it on the right with a 32 px gap, and the up-next list across the full width below.
That keeps Listen and the first lines up next in the first view on tablets, also with the mini player docked or the player bar shown; the owner chose it on 2026-11-11 over stacking below 1024 px.
At 1024 px and wider the artwork column grows to minmax(300px, 440px) with a column gap of clamp(32px, 4vw, 64px), the name sits at the foot of its row, and the up-next list moves under the name in the right column.
From 1600 px the cover, the name and up next sit in three columns (minmax(300px, 440px), minmax(360px, 1fr) and minmax(360px, 560px)), centred against the cover, and Home's search with its genres shares the row below with the moments to listen for (720 px and the rest).
Wherever the name sits beside the cover (from 700 px) favourite, download and details follow Listen with a 10 px gap; on phones they sit at the end of Listen's row.
The scene's rings may pass behind the featured name and Up next: measured over six frames of motion at 1905 by 911, the name keeps at least 6.6:1 at night and 9.5:1 by day, and the muted metadata 8.6:1 and 6.0:1.
Below 700 px it stacks.
At 600 px and below the cover spans the content width at 5:4 instead of square, with a 24 px gap below it, so the first recording up next stays in view with the mini player docked at 390 by 844.
That is a second deliberate divergence from the direction contract, which named square artwork across the width.

Collections use an auto-filling grid of tiles (minmax(188px, 1fr), 28 px row gap, 20 px column gap).
At 600 px and below a grid of recordings becomes a list of 72 px rows, and a rail becomes a horizontal snap scroller of 156 px tiles that bleeds to the screen edges.
Sections sit 56 px apart (44 px on phones); panels pad 24 px (20 px at 700 px and below) and dialogs 28 px.
Reading pages cap at 760 px.

Breakpoints the build uses: 1600 px (the featured recording in three columns, search beside the moments, Settings in three columns), 1100 px (narrower sidebar and gutter, two-column facets, binaural modes two by two), 1024 px (larger featured artwork with up next beside it), 900 px (mobile navigation and mini player), 700 px (featured artwork beside its name, compact binaural and panels), 600 px (rows, rails, bottom-sheet dialogs, the 5:4 hero cover and the hidden Home title), 420 px (logo mark without the wordmark), 380 px (narrowest gutter, compact hero Play, the featured artist and time on separate lines, and only the other language's link) 360 px (13 px tab labels) and 340 px (content-sized tabs).
Two container thresholds complement them: a recording line under 340 px of content folds its actions, and a featured column under 350 px takes the compact hero.

## Elevation & Depth

Depth is tonal first: the ground, then surface, surface 2 and surface 3 step up in lightness at night and step down from white by day.
Panels separate from the ground with a 1 px hairline or a surface-2 fill, never both under a wide shadow.
Shadows are reserved for things that float over content (the featured artwork, Play on artwork, dialogs, the toast, the download status card, the player's error strip), and they are soft, plum-tinted and pulled in with negative spread so they read as lift rather than outline.
Coloured light is a state, not a decoration: jade light means listening, and lavender light appears only under a hovered filled button.
The scene adds atmospheric depth at the top of the screen at a fixed strength (0.6 by day, 0.45 at night) and never behind body text.

### Shadow Vocabulary

- **Featured artwork lift** (`box-shadow: 0 28px 60px -28px var(--shadow)`): the leading recording's cover.
- **Play on artwork** (`box-shadow: 0 10px 24px -10px var(--shadow)`): the round Play on a tile; on hover it becomes `0 12px 28px -10px var(--jade-glow)`.
- **Hero Play halo** (`box-shadow: 0 14px 34px -14px var(--jade-glow)`): the featured Listen pill; on hover `0 18px 40px -12px var(--jade-glow)`.
- **Playing ring** (`box-shadow: 0 0 0 2px var(--jade), 0 0 28px -6px var(--jade)`): the loaded recording's artwork wherever it is listed; the player's artwork uses a 20 px halo.
- **Player Play while playing** (`box-shadow: 0 0 0 4px color-mix(in oklab, var(--jade) 22%, transparent), 0 12px 30px -8px var(--jade-glow)`).
- **Button hover glow** (`box-shadow: 0 8px 24px -10px var(--lav-glow)`): filled buttons; the Listen button uses jade glow instead.
- **Dialog** (`box-shadow: 0 30px 80px -30px var(--shadow)`).
- **Toast** (`box-shadow: 0 14px 36px -14px var(--shadow)`), **download status** (`0 18px 40px -18px var(--shadow)`) and **player error** (`0 12px 30px -14px var(--shadow)`).
- **Segment inset** (`box-shadow: inset 0 0 0 3px var(--surface-2)`): the current language's ring inside the language switch, standing in for the track's padding rather than lifting it.

### Named Rules

**The Glow Means Listening Rule.** A jade ring or halo marks the recording that is loaded or playing, and Play controls glow on hover and while playing.
No other element carries coloured light at rest.

**The Two Panes of Glass Rule.** Backdrop blur exists in exactly two places: the top bar once content scrolls under it (the ground at 78%, 18 px blur, 140% saturation) and the dialog veil (6 px blur over the scrim).
At the top of a page the bar is clear so the wash runs to the edge, and under reduced transparency both are solid.

**The Fade Before Text Rule.** The scene and the wash fade to the solid ground before content (the scene mask runs from opaque at 35% to clear at 92%, the wash gradient reaches the ground at 96%), so body text always sits on solid colour.

## Shapes

Corners follow one grammar: cards and panels 16 px, artwork and fields 12 px, small artwork in rows and the player 10 px, dialogs 20 px, and every control a full pill.
Transport Play, Play on tiles, badges and the logo mark are circles.
On phones a dialog becomes a sheet with only its top corners rounded at 20 px.
Borders are thin and purposeful: a 1 px hairline on surfaces, a 1.5 px boundary on operable controls and choice cards, and a 2 px border on every pill button (in the fill colour for filled pills, the control-boundary colour for outlined ones) so filled and outlined pills share one size.
Artwork clips to its corners; the focus ring is a 3 px outline offset 2 px and softened to a 6 px radius.

**The Shape Grammar Rule.** Cards 16, artwork and fields 12, controls are pills, Play is round.
A new element takes the shape of the role it plays, never a new radius.

## Components

### Buttons

Confident pills with a single filled voice per view.

- **Shape:** full pill, 48 px minimum height, 22 px side padding, 2 px border.
- **Filled:** lavender fill with on-lavender label in Button type; the one filled action of a view.
- **Listen:** the jade twin, used only to start listening outside a recording card (the binaural Start, 56 px tall with 28 px padding and 1.125rem type).
- **Secondary:** transparent, with the shared 2 px border in the control-boundary colour and an ink label; hover fills surface 2 with no glow.
- **Danger:** danger fill, or outlined in danger for the secondary destructive action.
- **Hover / Focus / Press:** filled pills gain their soft glow on hover; focus is the 3 px focus ring; press scales to 0.97 in 140 ms on the press curve; disabled drops to 55% opacity.
- **Icon buttons:** 48 px transparent pills with ink icons, surface-2 on hover, jade ink when pressed, and a 22 px jade count badge where one applies (the sleep timer).
- **Text buttons and links:** lavender, 700 weight, at least 44 px tall; text buttons stay underlined, text links underline on hover.

### Play Controls

Jade's main home, in four forms.

- **Hero Play:** a labelled jade pill reading "Listen" / "Lắng nghe" in 1.125rem Button type, 64 px tall on desktop and 56 px on phones, with a round icon well (46 px, 40 px on phones) tinted 14% on-jade, 26 px trailing padding and a jade halo; at 380 px and below the label drops to 1rem and the trailing padding to 20 px.
  The direction contract named a 64 px round Play here; the build deliberately uses the labelled pill, because a labelled action reads unambiguously for tired listeners and the larger target suits reduced motor control.
- **Tile Play:** a 52 px jade circle inset 10 px from the bottom-right corner of the artwork, with the plum lift shadow.
  In a featured column narrower than 350 px (Home beside its cover at 700 to about 780 px, 900 to 1023 px and 1024 to about 1180 px, with the desktop scrollbar gutter) the hero takes the compact form (56 px, 40 px well, 1rem, 16 px trailing padding) and Download moves into details, so Listen, Favourite and Details keep one line.
- **Line Play (pointer):** covers the 56 px line artwork as a veil of the ground at 55% (solid surface 2 under reduced transparency), shown on hover, on focus and on the loaded recording.
- **Line Play (touch):** where the device has no hover or has a coarse pointer, the cover always carries a 30 px opaque jade badge with a 2 px ground ring in its bottom-right corner, the tile's composition, while the whole cover stays the target; a disabled one shows at half opacity.
- **Line focus:** the ring is drawn inside the cover, which clips overflow: a 2 px ground halo, then the 3 px focus colour, above the downloaded check.
- **Player Play:** a 52 px jade circle (48 px on mobile) that gains a 4 px translucent jade ring and halo while playing.
- **State:** the loaded recording's Play becomes Pause while it plays, and resumes rather than restarts.

### Chips

- **Filter chip:** a 44 px outlined pill (1.5 px control boundary, 18 px padding, UI type); selected or current chips fill with lavender tint and take a lavender border.
- **Category link:** the same pill filled with surface 2 and no border, surface 3 on hover.
- **Status pill:** a 28 px surface-3 pill in Label type at 700, for read-only states only.

### Cards / Containers

- **Corner Style:** 16 px.
- **Background:** surface with a 1 px hairline (panels, facets, admin items), or surface 2 without a border (info panels, notes, empty states, storage and frequency cells).
- **Shadow Strategy:** none at rest; see Elevation & Depth.
- **Internal Padding:** 24 px (20 px at 700 px and below); empty states 32 px; settings panels align in two columns from 1100 px up and in three (appearance, account, private check-ins) from 1600 px, each at its own height.
- **Choice cards:** binaural modes and mood scores are whole-card radios: surface fill, 1.5 px hairline, 16 px corners, surface 2 on hover, and a lavender border over a 14% lavender mix when selected; focus rings the whole card.

### Inputs / Fields

- **Style:** labels above in UI type; 48 px boxes with 10 px by 14 px padding, 12 px corners, a 1.5 px control boundary and a surface fill; placeholders in muted ink.
- **Focus:** a 3 px focus outline offset 1 px, and the border takes the focus colour.
- **Error / Disabled:** invalid fields take a danger border; disabled controls show a not-allowed cursor.
- **Width:** a field grows with its column up to 32rem, so a choice stays near its label on a wide screen; search boxes size themselves, and a labelled field always stacks its name above it.
- **Search box:** a 56 px pill with a leading muted icon and an embedded filled button (46 px); the whole box rings on focus, and on phones the icon moves into a 48 px round submit so the field keeps its width.
- **Switch:** 52 by 30 px with a 21 px knob; off is surface 3 with a control boundary, on is lavender with an on-lavender knob that slides 22 px in 200 ms.
- **Checkboxes and radios:** 22 px native controls tinted lavender through the accent colour.

### Navigation

- **Sidebar (desktop):** a solid surface beside the wash with the wordmark and its 40 px jade logo mark, then 48 px pill links in muted UI type with 21 px icons that never shrink; hover fills surface 2 with ink, and the current page fills surface 3 with ink and a lavender icon.
  Every destination keeps one line: the 216 px sidebar pads 12 px and its links 10 px with a 10 px icon gap, so the longest name, "Nhật ký cảm xúc" (137 px in bold), fits.
  The legal links in the sidebar footer are muted, 44 px tall and spaced 16 px apart with no separators, so a line break never strands one.
- **Top bar:** 64 px (60 px on mobile), clear at the top of a page and turning to glass once content scrolls under it, solid under reduced transparency; it holds the appearance toggle, the language switch and an outlined 44 px account pill.
  The language switch is a surface-2 pill filled edge to edge by 44 px links with no track padding; the current language sits on surface inside an inset 3 px surface-2 ring, and at 380 px and below only the other language's link shows.
- **Mobile navigation:** five equal columns on an opaque surface with a hairline top edge; each item is an icon in a 56 by 30 px pill over a Label-type name, muted at rest, and the current item's pill fills surface 3 with a lavender icon over an ink label.
  At 340 px and narrower the columns size to their labels with an equal share of the rest and the pill narrows to 48 px, so "Trang chủ" and "Khám phá" never touch.
- **More:** a sheet of 52 px pill links using the same current treatment as the sidebar.

### Recording Artwork

The signature: every recording gets a cover generated from its id, its family and its colour, drawn as one inline SVG with no image request.
A cover is the palette's deep colour, a mid light field and a light field placed by a seeded generator (FNV-1a over family and id, then mulberry32), and the family's line work in the light colour at a constant stroke width.
The six families are forest (growth rings around an off-centre point), rain (falling strokes over rings on still water), sea (six stacked swells), piano (fourteen levels like a quiet meter), river (six bands flowing corner to corner) and night (three orbits with travelling points and scattered stars).
Lines draw at 1.4 px and 72% opacity, piano at 3 px and 90%, and the featured cover at 2 px (piano 6 px).
A cover never changes between renders.

### Recording Tile, Row and Feature

- **Tile:** square artwork with 12 px corners and the round Play, then the name (UI size at 700, 1.3 line height), the artist in muted Label type, and a bottom line of duration and actions.
- **Line (row, and the phone list form of any grid):** 56 px artwork with 10 px corners beside the name (two lines at most) and artist, with duration and actions at the end; 72 px tall with 8 px padding bleeding into the gutter, surface 2 at 80% on hover or focus; on phones download moves into the details sheet.
  At 600 px and below every grid of recordings, including the ones a view wraps (Downloads, the Binaural picker), reads as lines.
  Each line is a size container: under 340 px of content (320 to 375 px phones, the picker inside its card, Home's up next beside a large cover) download and favourite fold into the details sheet, a saved heart stays, and the duration joins the artist, so the name keeps at least 140 px.
  A downloaded line's check is a 20 px corner mark at the top-left, clear of the touch badge; on touch a tap on it plays.
- **Feature:** artwork up to 460 px square with 16 px corners and the featured lift, the name in Display, the artist at 1.125rem, metadata in muted ink separated by 4 px dots, and the hero Play beside favourite, download and details.
  From 700 to 1023 px the artwork is at most 360 px, beside the name; from 1600 px up next takes a third column.
  At 600 px and below the cover is 5:4 across the content width and the artist and time share one line; at 380 px and below they stack on separate left-aligned lines with no leading separator.
- **Loaded recording:** wherever it is listed its artwork wears the playing ring, and its name and duration turn jade ink.
- **Selection mode:** when choosing recordings for a playlist, Play becomes add or check and the chosen artwork takes a 3 px lavender outline.

### Player Bar

A docked, opaque surface with one jade control.
Desktop is a three-column grid: the recording (56 px artwork, name in 700 with ellipsis, muted artist), the transport (previous, Play, next) above a seek row of tabular 14 px times, and the tools (volume where the platform honours it, repeat, sleep timer, queue, finish).
At 900 px and below it becomes the mini player: 48 px artwork, a 48 px Play and a "Controls" secondary pill that opens the seek row and tools in stacked rows; phones and tablets keep volume on their hardware buttons.
While playing, the artwork wears the playing ring and Play its halo.
Errors appear in a danger-tint strip with 16 px corners just above the bar.

### Dialogs, Toast and Status

- **Dialog:** a surface panel with 20 px corners, 28 px padding, a hairline and the dialog shadow over the blurred scrim, 520 px wide (860 px for wide dialogs); on phones it becomes a bottom sheet with full-width actions.
  It arrives by rising 18 px and scaling from 0.985 in 320 ms, and the veil fades in over 200 ms.
- **Toast:** an inverted pill (ink fill, ground-coloured text) above the player and navigation.
- **Download status:** a surface-2 card with 16 px corners and a hairline at the bottom-right, full width on mobile.
- **Loading:** a skeleton in the exact shape of the featured recording (cover, name, artist and Play pill) with a surface-2 to surface-3 sheen over 1.6 s.

### The Wash and the Scene

- **Wash:** two radial light fields over the top band, at 22% across the top and at 88% across and 12% down, fading into the ground.
  At night they use the recording's mid colour at the wash strength (0.5) and its glow at 55% of that; by day they use its light colour at the day wash strength (0.8) and its mid colour at 32.5% of that.
  The colours are registered properties, so a new recording cross-fades over 600 ms on the ease-out curve.
- **Scene:** each route draws its own procedural light form (rings, meter, waves, orbits, grid, ripples or prisms, with a per-route seed) from one interpreter with no textures or remote models, in slow cycles of tens of seconds.
  It re-tints in place to the recording's glow and mid colours over 600 ms with a cubic ease-out, while its accent stays jade.
  It falls back from a worker to a low-power main-thread scene to a still day or night poster, goes straight to the poster for Calm, reduced motion, the Still preference and Save-Data, only ever lowers its quality during a visit, and pauses on hidden tabs.
- **Binaural visualizer:** three 6 px jade bars that drift over 8 s while a session plays, never at the beat frequency.
- **Content reveals (GSAP):** elements entering the viewport rise 14 px from 94% opacity in 420 ms on expo-out with a 35 ms stagger capped at 140 ms; anything already in the first view stays in place, and the scene fades up from 65% when a route opens.

## Do's and Don'ts

### Do:

- **Do** fill jade only for listening: Play on cards and in the player, the hero Listen pill, the binaural Start button, progress and range fills, the playing ring and glow, the logo mark, and the downloaded and timer badges.
- **Do** use lavender for every other accent: links, the one filled button per view, switches, selected chips and choice cards, and focus.
- **Do** give every recording its generated cover from its id, family and colour, and let that palette drive the wash and the scene tint.
- **Do** keep primary controls at 48 px and secondary ones (chips, text links, language and legal links, the account pill) at 44 px or more, all with the 3 px focus ring.
- **Do** keep body text at 16 px and nothing below 14 px, except the mobile tab labels at 13 px on screens 360 px and narrower.
- **Do** set durations, seek times, counts and frequencies in tabular numerals.
- **Do** keep the scene and the wash in the fixed top band and fade them to the solid ground before content.
- **Do** cross-fade borrowed colour over 600 ms with the ease-out curve, in the wash and the scene alike.
- **Do** give press feedback as a single 0.97 scale, and let headings (12 px), disclosures (6 px) and dialogs (18 px) arrive by moving, not fading.
- **Do** end Calm, reduced motion and reduced transparency in a still, opaque state.
- **Do** give hover feedback only inside `@media (hover: hover)`; a touch browser keeps :hover after a tap.
- **Do** use soft, plum-tinted, negative-spread shadows only on surfaces that float over content.

### Don't:

- **Don't** fill generic buttons, switches, selections or navigation with jade, and don't add a second neon.
- **Don't** let a recording's borrowed colour reach text or controls; it lives in the artwork, the wash and the scene.
- **Don't** add backdrop blur beyond the scrolled top bar and the dialog veil, or put glass on scrolling panels as the retired botanical world did.
- **Don't** use photographs, stock imagery or licensed covers for recordings.
- **Don't** build the neon-on-black streaming wall: the night ground is plum, never pure black, and neon is spent on one thing.
- **Don't** build pages as a stack of pastel wellness cards; panels hold forms and grouped tools, and recordings show as artwork, rows and rails.
- **Don't** add decorative gradients that do not come from a recording's palette; the wash, the artwork fields and the loading sheen are the only gradients.
- **Don't** fade text in on arrival or move anything with the beat.
- **Don't** use hard offset shadows, or coloured shadows other than the jade and lavender glows.
- **Don't** introduce national or cultural motifs; the world stays internationally neutral.
- **Don't** set text below 14 px or targets below 44 px.
- **Don't** hide a control until hover: touch has no hover, so anything a pointer reveals must show on touch.
