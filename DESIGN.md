---
name: HealingMuse
description: A Vietnamese-first listening sanctuary with lavender dawn scenery, plum text and jade controls.
colors:
  green: "#236553"
  green-hover: "#194c3e"
  mint: "#e5f0eb"
  secondary-hover: "#d7e9e0"
  bg: "#f3eff7"
  surface: "#fffcff"
  text: "#382b44"
  muted: "#665571"
  line: "#d9cfe2"
  navigation-current: "#e5dbee"
  navigation-hover: "#eee6f4"
  navigation-current-hover: "#dcd0e9"
  frosted-frame: "#fffcffdb"
  frosted-control: "#fffcffe8"
  frosted-mobile: "#fffcfff2"
  search-border: "#c5b4d2"
  field-bg: "#fbfcf6"
  field-border: "#cbd6c1"
  white: "#ffffff"
  focus: "#78419a"
  danger: "#963f34"
  danger-hover: "#803f49"
typography:
  display:
    fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif'
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 650
    lineHeight: 1.28
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif'
    fontSize: "19px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  field: "9px"
  control: "10px"
  navigation: "12px"
  surface: "14px"
  dialog: "16px"
  chip: "24px"
  circle: "50%"
spacing:
  compact: "8px"
  control: "12px"
  card: "14px"
  phone: "16px"
  content: "24px"
  section: "30px"
  desktop: "36px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-secondary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.green}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.green}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-danger-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "9px"
  field:
    backgroundColor: "{colors.field-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  catalog-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  search:
    backgroundColor: "{colors.frosted-control}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "8px 10px 8px 18px"
  navigation-link:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "12px 15px"
  navigation-link-current:
    backgroundColor: "{colors.navigation-current}"
    textColor: "{colors.text}"
  chip:
    backgroundColor: "{colors.frosted-control}"
    rounded: "{rounded.chip}"
    padding: "10px 19px"
  chip-selected:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
  track-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "27px"
  player:
    backgroundColor: "{colors.frosted-control}"
    height: "96px"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.dialog}"
    padding: "32px"
---

# Design System: HealingMuse

## Overview

**Creative North Star: "The Dawn Listening Sanctuary"**

Misty lavender, blush and pale blue landscapes surround dark plum text and jade listening controls.
The atmosphere is soft and spacious, with familiar music choices and readable Vietnamese copy carrying the foreground.
English uses the same typography, materials and interaction hierarchy.

Frosted navigation, search and the persistent player reveal the scenery beneath bounded regions.
Recording cards, forms, private records, credits and legal prose retain opaque reading surfaces.
Human-created instrument and nature photographs continue to identify recordings, while six generated landscapes provide decorative atmosphere.
Music remains human-created, and the deployed app contains no AI generation or AI APIs.

This document records the implemented cascade in src/app/globals.css and src/app/sanctuary.css and its native component patterns.
The offline shell in public/offline/style.css reuses the palette and typeface on opaque surfaces around a native audio control.
The approved direction is recorded in .impeccable/direction.md.
Photograph provenance remains in content/artwork-credits.json, and exact decorative prompts, transformations and hashes are recorded in content/scenery-credits.json.

**Key Characteristics:**

- Lavender dawn scenery frames plum reading text and jade listening controls.
- Self-hosted Be Vietnam Pro supports Vietnamese and English reading.
- Frosted persistent chrome surrounds opaque content surfaces.
- Human-created recording photography stays distinct from decorative generated landscapes.
- Native controls, visible focus and a stable player preserve familiar listening behavior.
- Calm mode and system preferences remove decorative movement or transparency.

## Colors

The palette pairs warm lavender neutrals with jade actions and restrained blush and blue within the landscapes.
Frontmatter values are normative, while the sidecar's synthesized tonal strips are preview metadata rather than application color scales.

### Primary

- **Listening Jade** (`green`) fills primary actions, selected filters and the central play control.
- **Deep Jade Hover** (`green-hover`) marks hovered primary actions and recording play buttons.
- **Soft Jade** (`mint`) fills secondary actions, with **Jade Hover Wash** (`secondary-hover`) for their hover response.

### Secondary

- **Lavender Seat** (`navigation-current`) marks the current destination and supplies supporting lavender surfaces.
- **Lavender Hover** (`navigation-hover`) responds to ordinary navigation hover.
- **Lavender Selection** (`navigation-current-hover`) strengthens a hovered current destination and supplies text selection.
- **Plum Focus** (`focus`) supplies the visible keyboard outline.

### Neutral

- **Dawn Ground** (`bg`) supplies the page background and the scenic fade beneath content.
- **Reading White** (`surface`) supplies cards, panels, reading regions and dialogs.
- **Plum Ink** (`text`) carries headings and body copy.
- **Quiet Plum** (`muted`) distinguishes supporting text without abandoning the palette.
- **Lavender Divider** (`line`) separates related controls and information.
- **Frosted Frame**, **Frosted Control** and **Frosted Mobile** retain the distinct alpha values of persistent chrome.
- **Search Boundary** (`search-border`) defines the search field against scenery.
- **Field Ground** and **Field Boundary** preserve the existing pale opaque form treatment.
- **Action White** (`white`) keeps filled action labels legible.

Muted Brick (`danger`) and Brick Hover (`danger-hover`) distinguish destructive actions.
These are functional state colors rather than decorative landscape accents.
The compatibility variable named forest now resolves to Plum Ink and does not define a green navigation system.

### Named Rules

**The Listening Jade Rule.**
Use jade to identify listening, selection and primary form actions while plum carries reading.

**The Legible State Rule.**
Pair color with a label, an icon or an explicit selected state so that color alone never carries meaning.

## Typography

**Display Font:** Be Vietnam Pro with Segoe UI, system UI and sans-serif fallbacks.
**Body Font:** The same family and fallback stack.
The online application loads self-hosted Latin and Vietnamese subsets at weights 400, 500 and 600.
The offline shell loads the regular subsets.

**Character:** One Vietnamese-capable sans serif joins discovery, personal information and listening controls.
Balanced heading wraps and restrained negative tracking retain the incumbent reading rhythm.

### Hierarchy

- **Display** uses the frontmatter display role for the home introduction, with a phone size of 28 CSS pixels.
- **Headline** uses the headline role for section headings, decreasing to 22 CSS pixels in phone section headers.
- **Title** uses the title role for smaller subheadings.
- **Body** uses the body role for prose, with paragraphs capped at 72 characters and the home introduction capped at 56 characters.
- **Label** uses the label role for primary buttons, secondary actions and native form labels.

General page headings retain their existing 35 CSS pixel size and decrease to 30 CSS pixels on phones.
Recording titles use body-sized text at weight 600 with a line height of 1.5.
Artist names and recording durations use 14 CSS pixels as secondary metadata.
Explanatory copy, recording credits, result summaries and private tables retain the 16 CSS pixel reading size.
Elapsed time, duration and release totals use tabular numerals to keep changing values steady.
Intermediate heading weights 550 and 650 use the nearest loaded face selected by the browser.

### Named Rules

**The Vietnamese Reading Rule.**
Keep prose at the established 16 CSS pixel body size and allow Vietnamese labels to wrap without clipping essential meaning.

## Layout

The desktop shell reserves a fixed left navigation column and a fixed bottom player.
The sidebar is 248 CSS pixels wide, decreasing to 218 CSS pixels at the compact desktop breakpoint.
Main content is centered within a maximum width of 1440 CSS pixels and uses 36 CSS pixel horizontal gutters.
The desktop top bar is 80 CSS pixels tall.

Recording grids use four columns on wide screens and three columns at or below 1200 CSS pixels.
Featured home shelves switch to two columns at that breakpoint.
At or below 900 CSS pixels, bottom navigation replaces the sidebar, main gutters become 22 CSS pixels and the top bar becomes 72 CSS pixels tall.
The navigation accounts for the bottom safe area, and the sidebar scrolls when desktop height is constrained.
Its supporting note is hidden on desktop viewports no taller than 850 CSS pixels so navigation and legal links remain reachable.

At or below 600 CSS pixels, main gutters become 16 CSS pixels and recording grids use two columns with 14 CSS pixel gaps.
Home sections use 22 CSS pixel separation instead of the larger 30 CSS pixel rhythm.
Musical categories and catalogue category chips form horizontal scrolling rows with unbroken labels.
The nature feature becomes a vertical image and text stack.
At or below 360 CSS pixels, the top bar wraps the brand above its actions.

Catalogue facets use four desktop columns and two columns at or below 1200 CSS pixels.
They sit within a native disclosure that begins closed unless an advanced facet is already selected.
Playlist and administrator form grids collapse to one column on phones.
The first phone viewport retains playable recording choices, and additional controls expand without shrinking touch targets.

The phone player occupies 72 CSS pixels while idle, 126 CSS pixels during playback and 186 CSS pixels when expanded.
The shell reserves bottom space for the current player state and persistent navigation.
The player remains mounted through route and locale changes.

## Elevation & Depth

The system combines scenic depth, tonal layering and soft offset shadows.
A fixed landscape fades into Dawn Ground behind content, while bounded frosted chrome separates persistent controls from the scene.
Reading cards stay opaque and carry a light shadow, and panels use their divider boundary.
The nature feature retains a lavender surface behind its photograph and copy.

### Shadow Vocabulary

- **Recording lift** (`0 6px 20px #382b4410`) separates recording cards from the scenic ground.
- **Recording hover** (`0 8px 24px #382b441a`) strengthens the card's separation on hover.
- **Sidebar boundary** (`6px 0 30px #382b4408`) softly marks the fixed desktop frame.
- **Play control lift** (`0 3px 12px #20382318`) separates the circular play action from its photograph.
- **Player boundary** (`0 -4px 30px #263b2510`) marks the persistent listening layer.
- **Dialog elevation** (`0 18px 64px #382b4433`) separates protected dialog content from its plum backdrop.

### Named Rules

**The Bounded Glass Rule.**
Apply the shared 12 CSS pixel backdrop blur to navigation, search and the player while keeping reading regions opaque.

**The Visible Before Motion Rule.**
Keep content visible before JavaScript runs and let decorative movement leave native scrolling and playback intact.

Headings briefly move upward from a 10 CSS pixel offset and opacity 0.8 over 420 milliseconds.
Below-fold sections reveal from a 12 CSS pixel offset over 480 milliseconds after a shared observer detects them.
Both use the implemented exponential ease-out curve cubic-bezier(.16,1,.3,1).
Scenic parallax is limited to 14 CSS pixels, with scroll work scheduled through a passive listener and one animation frame.
Calm mode and reduced motion cancel decorative animations, observers and scenic movement.
Reduced transparency replaces frosted regions with Reading White and removes backdrop blur.

## Shapes

Gently rounded rectangles preserve the incumbent form language.
Recording cards, general panels, search and the nature feature share the surface radius.
Fields, rectangular actions, navigation destinations and dialogs use their established radius roles.
Circular play actions separate playback from rectangular navigation and form controls.
Pill-shaped category filters retain an explicit selected state.

Recording cards clip their photographs within the surface silhouette.
Artwork uses object-fit cover at a ratio of 1.35 on larger screens and 1.25 on phones.
Decorative landscapes fill the fixed background with a centered crop and a fade into the reading ground.
The background remains outside pointer interaction and the accessibility tree.

## Components

### Buttons

Buttons remain familiar native actions, with anchors used for navigation.
Primary and secondary variants use the established control radius and padding, with a minimum height of 44 CSS pixels.
Primary actions pair Listening Jade with Action White and Deep Jade Hover.
Secondary actions use Soft Jade, jade text and a light jade border, with Jade Hover Wash on hover.
Destructive actions retain their brick treatment and an explicit action name.
Their hover state keeps white text on Brick Hover, including the secondary danger variant.
Disabled actions use half opacity and the default cursor.

Keyboard focus outlines are three CSS pixels wide with four CSS pixels of offset, using Plum Focus.
Icon actions use consistent Lucide SVG artwork, a named accessible label and targets of at least 44 by 44 CSS pixels.
Pressed favorites and repeat controls preserve both their explicit pressed semantics and the incumbent selected fill.

### Chips

Filter chips are pill-shaped native controls with a light lavender boundary and a minimum height of 44 CSS pixels.
Selected category buttons use Listening Jade, Action White and aria-pressed.
Listening-goal chips are links with a small SVG arrow and preserve the corresponding catalogue query.
The phone category row scrolls horizontally without wrapping labels.
Chip focus uses the shared visible outline.

### Cards / Containers

Recording cards combine human-created photography, a meaningful category label, a circular play action and readable recording names.
The category label identifies the recording type without implying diagnosis or treatment.
Text regions use 14 CSS pixel side padding, decreasing to 10 CSS pixels on phones.
Play, favorite, download and details actions retain separate accessible names.
Details present attribution, license and provenance information.

General panels use Reading White, a divider boundary and the surface radius.
Their padding is 27 CSS pixels on larger screens and 22 CSS pixels on phones.
Empty states retain a dashed boundary, a descriptive heading and a relevant action on an opaque reading surface.
Credits use padded reading lists with separated entries, wrapping attribution and underlined jade links.
Legal content uses a padded opaque surface rather than reading directly on the scene.
Private mood history retains native tables with captions and row and column headings.

### Inputs / Fields

Inputs, selects, textareas, checkboxes and radio groups retain native behavior.
Form and administrator labels keep the 16 CSS pixel reading size.
Stacked form fields preserve the incumbent opaque field background and boundary, with a minimum height of 48 CSS pixels.
Textareas grow vertically from a minimum height of 90 CSS pixels.
Placeholders use Quiet Plum at full opacity, and carets use Listening Jade.
Textual alerts explain errors independently of color.

Catalogue selects fill their grid column and shrink to available width without forcing page overflow.
A native summary with a minimum height of 44 CSS pixels opens the advanced filter disclosure.
Search combines a native search field, decorative SVG and named submit button within a bounded frosted surface.
Search caps its width at 700 CSS pixels, and its field is at least 53 CSS pixels tall.
The search label remains available to assistive technology when visually hidden.

### Navigation

Desktop navigation places SVG icons and 16 CSS pixel labels on the pale frosted sidebar.
Links are at least 52 CSS pixels tall, and the current destination uses Lavender Seat with Plum Ink.
Ordinary links use Lavender Hover on hover, while the current destination uses Lavender Selection.
The phone navigation places names beneath icons and marks the current destination with a lavender rounded surface and aria-current.
The language selector uses native links with an explicit current state and targets of at least 44 CSS pixels wide and tall.
Legal links occupy separate 44 CSS pixel rows in the desktop footer.
A skip link becomes visible on focus and leads to main content.

### Persistent Player

The player remains the system's listening continuity component.
Its fixed position, bounded translucency, artwork thumbnail and tabular progress remain consistent across routes.
The idle state hides tools and seeking to preserve reading space.
Phone playback exposes a named expand action with aria-expanded and aria-controls for secondary tools.
A native range input names seeking and supplies elapsed and total time as an accessible text value.
Repeat reports its pressed state, and timer and queue actions open named dialogs.
The player uses an opaque surface without blur when reduced transparency is requested.

### Scenery

Six cohesive landscapes share the approved misty dawn palette.
The home route uses a lake, discovery a mountain valley, library a forest, downloads a coast, mood a quiet pool and settings clouded hills.
Authentication, legal and administrative routes use a subdued lake variant.
Static AVIF and WebP assets are selected at widths of 480, 960 and 1600 pixels by native picture sources.
Phone scenery uses the 480-pixel variant and occupies 54 viewport-height units behind the fade.
Larger scenery regions cap at the smaller of 78 viewport-height units or 760 CSS pixels.
The images decode asynchronously with low fetch priority and carry empty alternative text.
Calm mode also lowers scenery opacity to 0.5.

### Dialogs, Mood Choices and Release Review

Dialogs use Reading White, a dimmed plum backdrop and the dialog shadow.
Regular dialogs cap their width at 550 CSS pixels, while wider administrator dialogs cap at 860 CSS pixels.
Both retain a 16 CSS pixel viewport margin and an independently scrolling interior.
Radix supplies dialog semantics, a named close action and focus return.

Mood choices remain a native radio group with a visible legend and textual labels.
Their legend and labels retain the 16 CSS pixel reading size on larger screens and phones.
Consistent weather SVG icons support the labels without replacing them or suggesting a clinical interpretation.

Release review uses an opaque panel with separated release entries, named totals and a wrapping manifest hash.
An administrator enters a name and confirms three reviews through required native checkboxes.
Each checkbox label occupies at least 44 CSS pixels of height, and incomplete or offline releases disable the form.
Signed-out Mood and Content studio gates explain the purpose of that specific destination.

## Do's and Don'ts

### Do:

- **Do** reuse the lavender ground, plum reading and jade action hierarchy across routes.
- **Do** preserve the Vietnamese-capable typeface, 16 CSS pixel prose and wrapping essential labels.
- **Do** keep navigation, search and player glass bounded and reading regions opaque.
- **Do** retain native controls, named SVG actions, visible plum focus and 44 CSS pixel targets.
- **Do** distinguish human-created recording artwork from generated decorative scenery and preserve both provenance records.
- **Do** keep content visible before JavaScript and preserve normal scrolling and continuous playback.
- **Do** respect Calm mode, reduced motion and reduced transparency in new surfaces.

### Don't:

- **Don't** blur an entire reading area or animate layout dimensions for decorative movement.
- **Don't** replace named controls with emoji, text glyphs or unlabeled icons.
- **Don't** clip essential Vietnamese labels or reduce prose to secondary metadata sizes.
- **Don't** introduce decorative eyebrow text instead of meaningful headings.
- **Don't** present imagined scenery as a documented location or add diagnostic and treatment claims.
- **Don't** add AI generation, models or AI APIs to runtime music or wellbeing flows.
- **Don't** persist scenery, private pages, signed URLs or personal records through the offline cache.
