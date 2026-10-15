# HealingMuse

A Vietnamese-first music and wellbeing PWA for adults living with cancer, with an English interface and a garden for every page.
HealingMuse offers recreational listening and optional personal reflection without treatment claims.
The current published catalogue contains **348 human-created instrumental recordings**, available to browse and play without signing in.
The application contains no runtime AI models, chatbots, transcription or generation APIs.

**Website:** [healingmuse.vercel.app](https://healingmuse.vercel.app/vi) · [English](https://healingmuse.vercel.app/en)

## Contents

- [Listening and discovery](#listening-and-discovery)
- [Binaural sessions](#binaural-sessions)
- [Library, downloads and reflection](#library-downloads-and-reflection)
- [Botanical design and accessibility](#botanical-design-and-accessibility)
- [Accounts and email delivery](#accounts-and-email-delivery)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Architecture and data boundaries](#architecture-and-data-boundaries)
- [Content administration and releases](#content-administration-and-releases)
- [Validation and performance](#validation-and-performance)
- [Deployment and recovery](#deployment-and-recovery)
- [Troubleshooting](#troubleshooting)
- [Contributing and licensing](#contributing-and-licensing)

## Listening and discovery

Home starts with an identified recording and a visible Play action, followed by search, listening intentions and curated collections.
Explore and the Binaural background catalogue share search and filter controls.
Search supports Vietnamese text, and discovery can be narrowed by category, listening goal, musical style, instrument and tradition.
Cursor pagination bounds each response instead of downloading the entire catalogue into the first page.
Explore and Binaural use 24 recordings per page, so 348 recordings span 15 pages with 12 on the final page.
Recording details include the artist, attribution, license, source and any declared preparation changes.

The ordinary player provides play/pause, seeking, volume, queue navigation, repeat and a sleep timer.
Playback continues across application routes and language changes through one mounted audio provider.
Media Session integration provides supported browser and device controls.
The idle player surface stays hidden until a recording is selected, while the audio infrastructure remains mounted.
Queue continuation retrieves further catalogue pages when needed.
Playback begins only after a listener action.

Hosted recordings use fresh, short-lived playback grants rather than public storage buckets.
The player can use a recording already downloaded to the current device.
Administrators may also supply a visible, user-initiated YouTube embed or an ordinary external Spotify link.
These external sources do not become downloadable or mixable hosted recordings.

## Binaural sessions

Open `/vi/brainwave-entrainment` or `/en/brainwave-entrainment` without an account.
Choose an intention, duration and preset, then press Start.
Detailed frequency controls are available through progressive disclosure.

| Band  | Adjustable difference | Presets       |
| ----- | --------------------- | ------------- |
| Beta  | 14-30 Hz              | 16, 20, 25 Hz |
| Alpha | 8-13 Hz               | 8, 10, 12 Hz  |
| Theta | 4-7 Hz                | 4, 6, 7 Hz    |
| Delta | 0.5-3 Hz              | 1, 2, 3 Hz    |

The default carrier is 200 Hz in the left channel, with the selected difference added in the right channel.
The carrier can be adjusted between 100 and 500 Hz.
Session lengths include 5, 10, 15, 20, 30, 45 and 60 minutes, plus custom whole-minute lengths from 1 to 120.
Master, tone and background levels can be adjusted independently.
All 348 published recordings can be discovered and selected as optional backgrounds through the shared catalogue controls.
Selecting a recording exposes a return link to the session controls.
Tone-only listening remains available when a background recording fails.

The Web Audio engine loads with the Binaural page and creates its AudioContext only after Start.
Separate oscillators feed separate stereo channels, with gain ramps for parameter changes and a deadline on the audio clock.
Starting Binaural pauses ordinary music, and starting ordinary music pauses Binaural.
**Leaving the Binaural page pauses its session.**
Returning or recovering from an interruption requires an explicit Resume action.
Phone background and screen-lock playback depend on browser and operating-system behavior.

Opt-in device preferences retain configuration, favorite presets and a selected recording ID locally.
They do not store private playback URLs or a session history.
Offline catalogue search uses explicit device downloads only.
Tone generation can work without a connection when the Binaural page is already open; a fresh offline navigation opens the downloaded-music shell.

Use stereo headphones at a low device volume, take breaks and stop if listening is uncomfortable.
Application volume percentages do not measure headphone sound pressure.
Band names and frequency controls do not promise a particular brain state or a medical effect.
The in-app educational material links to its research and safe-listening references.

## Library, downloads and reflection

### Library

Signing in enables favorites and named playlists across devices.
Playlist editing supports ordering and removal, with revisions that reject stale updates rather than silently overwriting another device's changes.
Private Realtime notifications refresh the authenticated owner's state.
Guest listening remains available independently of these account features.

### Downloads and installation

Eligible hosted recordings can be explicitly saved to IndexedDB on the current device.
Downloads include progress, cancellation, integrity checks, recording metadata and attribution.
A complete file is checked against the expected byte count and SHA-256 when supplied before it is retained.
Individual recordings or the entire downloaded library can be removed from Downloads.
Downloaded files are device-local and do not synchronize to another browser.
Browser storage limits, private browsing and storage eviction can affect availability.

The PWA provides an installable shell, local fonts and an offline library view.
Installation prompts and instructions depend on the browser.
The service worker caches the public shell and decorative assets, while authenticated responses, playback grants and streamed music stay outside its caches.
Only an explicit download retains music for offline listening.

### Optional mood check-ins

Mood reflection requires separate consent.
Listeners can record paired before/after check-ins, view recent entries and summaries, and delete their records.
The retention migration schedules removal of entries older than 90 days.
Revoking mood consent removes the associated listening sessions and check-ins.
Content administrators do not gain access to another user's mood data through their content role.

## Botanical design and accessibility

HealingMuse keeps its lavender, plum and jade identity, logo and self-hosted Be Vietnam Pro typography.
Translucent panels, reflective edges and bounded frosted navigation frame the scenery.
Reading areas use stronger surface tinting to preserve text contrast.
Recording cards align their actions consistently, and forms retain normal document flow on smaller screens.

| Page              | Route after `/vi` or `/en` | Garden                      |
| ----------------- | -------------------------- | --------------------------- |
| Home              | `/`                        | Floating lotus court        |
| Explore           | `/explore`                 | Sculptural fern ravine      |
| Binaural          | `/brainwave-entrainment`   | Moonflower amphitheatre     |
| Library           | `/library`                 | Wisteria arbor              |
| Downloads         | `/downloads`               | Seed conservatory           |
| Mood              | `/mood`                    | Water-lily pool             |
| Settings          | `/settings`                | Bonsai courtyard            |
| Content studio    | `/admin`                   | Propagation glasshouse      |
| Password recovery | `/reset-password`          | Orchid vestibule            |
| Privacy           | `/privacy`                 | Sheltered fern cloister     |
| Terms             | `/terms`                   | Cypress arcade              |
| Credits           | `/credits`                 | Botanical sculpture gallery |

Authentication dialogs retain the current route's garden.
The offline shell uses a sheltered garden still.
Botanical imagery is decorative and does not imply that nature recordings are included in the current instrumental release.

### Appearance and motion

Your garden and Settings expose System, Day and Night appearance, plus Automatic and Still garden detail.
Appearance is applied before hydration and stored locally without a database change.
Automatic rendering uses one persistent Three.js scenery host and one active garden.
Where supported, rendering runs through OffscreenCanvas in a worker.
A lightweight main-thread renderer and matching responsive posters provide fallbacks.
Mobile rendering starts at 30 fps with capped resolution.
Sustained slow rendering reduces quality, then switches to a still without repeatedly oscillating between tiers.
Hidden tabs suspend rendering, and renderer failures do not block the audio player.

Short page entrances introduce the heading and listening surfaces.
New catalogue results use a capped stagger, including results that reuse existing recording cards.
Selections, pressed controls, disclosures and dialogs provide brief visual feedback.
Listening controls in the first viewport stay stationary during their entrance.
Entrances never require hidden default content, and scrolling remains native.
GSAP scopes and shared observers are cleaned up on route and preference changes.

Calm and reduced motion stop decorative animation.
Still garden reduces graphics work and data transfer while retaining ordinary interface feedback.
Reduced transparency replaces translucent surfaces with opaque fills.
Keyboard navigation, visible focus, accessible dialogs, status announcements and 44-pixel primary touch controls are part of the implementation.
Mobile navigation provides Home, Explore, Binaural and Library, plus More for the remaining destinations.
Focus is scrolled above fixed navigation and player surfaces when needed.
Automated accessibility checks complement the separate screen-reader and physical-device checks described below.

## Accounts and email delivery

Existing confirmed users can sign in with email and password without requesting a new email each time.
Optional email-code sign-in also provides an account-creation path under the configured Supabase policy.
A passwordless user can authenticate by code, then choose Set or change password in Settings.
Forgot or need to set a password requests a recovery email and opens a localized password page.
Supabase Auth handles password storage and authenticated password changes.
Application tables do not store passwords.

Production email onboarding and recovery depend on an approved sender.
Supabase's built-in sender is intended for development and restricts delivery to authorized organization-team addresses.
Public email authentication requires a verified SMTP delivery setup; see the [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
Keep existing email-confirmation settings and rate limits intact when diagnosing a delivery problem.

Set the production Supabase Auth Site URL to `https://healingmuse.vercel.app`.
Allow these exact recovery redirects and add exact preview equivalents only when required:

```text
https://healingmuse.vercel.app/en/reset-password
https://healingmuse.vercel.app/vi/reset-password
```

The optional Magic Link email template uses `{{ .Token }}` for code entry.
The Reset Password template retains its secure `{{ .ConfirmationURL }}` link.
Use the [Supabase redirect guide](https://supabase.com/docs/guides/auth/redirect-urls) when changing deployment origins.
Changing the app's site variable alone does not update Supabase's separate Auth URL configuration.

## Local development

### Requirements

- Node.js 22 and npm.
- Playwright Chromium for browser checks and garden-poster rendering.
- A configured Supabase project for accounts and cloud-backed application data.
- Prepared, licensed local recordings for an audio-enabled local preview.

### Start an isolated preview

```bash
npm ci
npm run dev:preview
```

Open `http://localhost:3000/vi` or `http://localhost:3000/en`.
The preview command isolates cloud configuration without editing `.env.local`.
It reads `media/prepared/catalog.json` and the corresponding prepared recordings when available.
A fresh clone does not contain private audio archives and can show an empty catalogue until local content is prepared.
The local preview does not authenticate against the production project.

For an optimized local preview:

```bash
npm run build:preview
npm run start:preview
```

Set `PREVIEW_PORT` when another port is needed.
Preview builds use `.next-preview`, independently of the configured application's `.next` output.
Do not deploy synthetic fixtures or a local-preview configuration to production.

### Run the configured application

Create a private `.env.local` using the configuration names below, then run:

```bash
npm ci
npm run dev
```

`npm run build` and `npm run start` build and run the configured application.
Public Next.js environment values are embedded during the build, so changing them requires a new build and deployment.
The repository and deployment ignore rules exclude credentials, local media, backups and test artifacts.

## Configuration

Only variables prefixed with `NEXT_PUBLIC_` belong in the browser configuration.
Keep service credentials and database connection strings private, and never paste their values into issues, logs or pull requests.

| Variable                               | Purpose                                            | Scope                                        |
| -------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Existing Supabase project origin                   | Public build configuration                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key, with RLS enforced        | Public build configuration                   |
| `NEXT_PUBLIC_SITE_URL`                 | Canonical application origin                       | Public build configuration                   |
| `SUPABASE_SECRET_KEY`                  | Trusted server operations and private audio grants | Server only                                  |
| `RATE_LIMIT_SALT`                      | Salt for server request-rate identities            | Server only                                  |
| `LOCAL_CATALOG_ENABLED`                | Explicit local catalogue opt-in                    | `false` in Production and configured Preview |
| `SUPABASE_DB_URL`                      | Direct migration and maintenance connection        | Local trusted operations only                |
| `SUPABASE_DB_CA_FILE`                  | Optional verified database CA file                 | Local trusted operations only                |

Production uses `NEXT_PUBLIC_SITE_URL=https://healingmuse.vercel.app`.
Local development can use `http://localhost:3000`.
Configure preview origins deliberately and keep production recovery redirects canonical.

Optional Backblaze B2 delivery support uses `B2_S3_ENDPOINT`, `B2_REGION` and `B2_BUCKET_NAME`.
Its server reader requires `B2_READ_KEY_ID` and `B2_READ_APPLICATION_KEY`.
Trusted local delivery commands use separate `B2_UPLOAD_KEY_ID` and `B2_UPLOAD_APPLICATION_KEY` credentials.
Upload credentials do not belong in Vercel or browser bundles.
B2 support does not imply that this catalogue has been migrated to B2.
Storage delivery remains subject to verified free capacity, operation allowances, spending safeguards and explicit release authorization.

## Architecture and data boundaries

| Layer                   | Implementation                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| Application             | Next.js App Router, React and strict TypeScript                           |
| Language                | next-intl with Vietnamese and English messages                            |
| Interface               | CSS/Tailwind, Radix Dialog and Lucide                                     |
| Motion and scenery      | GSAP, ScrollTrigger and direct Three.js                                   |
| Authentication and data | Supabase Auth, PostgreSQL, RLS and private Realtime                       |
| Audio delivery          | Private Supabase Storage, with an optional version-pinned B2 resolver     |
| Device storage          | IndexedDB downloads and local appearance/preferences                      |
| Offline shell           | Generated service worker and public shell assets                          |
| Hosting                 | Existing GitHub-connected Vercel project, Node.js 22, Singapore functions |
| Tests                   | Vitest, Playwright, axe-core and portable PostgreSQL fixtures             |

Server-rendered pages and streaming boundaries deliver catalogue content independently of decorative rendering.
Public catalogue metadata uses bounded server caching and is invalidated after content publication.
Playback-grant requests recheck publication and download rights before issuing a ten-minute URL.
The storage resolver is server-only and can pin B2 reads to verified object versions.
Private responses and signed URLs are not service-worker cache entries.
Same-origin mutation checks, schema validation, owner checks and database policies protect personal operations.
Content administration is a server-controlled role, separate from ordinary account ownership.

The public catalogue response remains `{items, total, nextCursor}`.
Playback grants retain `{url, expiresAt, bytes, sha256}`.
Appearance and graphics preferences require no database migration.

### Repository map

```text
src/app/                 Localized routes, API handlers and interface styles
src/components/          Shell, players, discovery, forms and personal features
src/lib/binaural/        Validated session configuration and stereo audio engine
src/lib/garden/          Procedural scenes, route configuration and worker protocol
src/lib/browser/         Downloads, API client and client-side utilities
src/lib/server/          Catalogue, storage resolver and API boundaries
src/lib/storage/         Optional B2 signing and integrity checks
src/messages/            Vietnamese and English source messages
src/offline/             Service-worker source
public/gardens/          Responsive posters rendered from the runtime scenes
public/offline/          Offline shell and generated translations/fonts
content/                 Source metadata, provider rules and artwork provenance
supabase/migrations/     Ordered, checksum-tracked schema migrations
scripts/                 Builds, preparation, delivery and validation tools
tests/                   Unit, browser, integration and visual evidence
```

`media/`, `.local/`, credentials and evidence artifacts are intentionally excluded from Git or deployment as appropriate.
Documentation and local design context may also be excluded by this workspace's ignore policy.
The README is the tracked entry point for application setup and behavior.

## Content administration and releases

Content studio supports draft inspection, authorized previews, publication, retirement, rights review, ordering and curated collections.
Release review records a named administrator attestation for completed listening, provenance and rights checks.
Delivery alone does not approve recordings.

The release workflow preserves recording IDs, attribution, immutable manifests, checksums and delivery receipts.
Publication validates the release ID and manifest hash, derives the reviewer identity from authentication, and atomically publishes eligible recordings with an audit trail.
Changed manifests and incomplete delivery are rejected.
Repeated submissions are idempotent, and previous publication states remain available for recovery.
When a release requires B2, matching verified version receipts are required.

The current production subset contains 348 instrumentals, including the administrator-published 62-recording instrumental replacement release.
The larger 1,000-recording preparation workflow does not make unapproved or undelivered material public.
Do not infer production availability from the local preview count.

Trusted preparation tools include `audio:import`, `audio:verify`, `audio:audit`, `audio:classify` and `audio:quarantine`.
Delivery tools include the controlled Supabase subset commands and B2 preflight/upload/verification commands listed in [package.json](package.json).
They are operator workflows, not steps required to run the interface.
Review their inputs, licensing evidence, checkpoints and current account allowances before invoking any upload or deletion.
The Free-plan workflow retains a storage reserve and must not authorize paid usage implicitly.
Never delete cloud objects or change storage providers as a side effect of a design update.

Migrations are applied through the trusted `db:migrate` tool after a separate schema and backup review.
It verifies connection identity and TLS certificates, tracks migration hashes and refuses edits to already-applied migrations.
Add a new migration for schema changes instead of rewriting migration history.
This interface refinement needs no migration, audio upload or publication action.

## Validation and performance

### Local checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run b2:test:preflight
npm run db:test
npm run db:test:catalog
npm run db:test:release
npm run db:test:b2
npm run security:repository
npm run build
npm run garden:budget
npm run security:client
```

Database suites use isolated portable PostgreSQL fixtures and exercise the real migration SQL.
They cover ownership, administrator boundaries, consent, playlist revisions, discovery, publication and delivery requirements.
They do not establish that a live Supabase project has applied the same schema.
Cloud database, recovery, load and delivery commands are separate operator checks and can access or mutate cloud state.

For browser checks against an optimized preview running on port 3127:

```bash
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:3127 npm run test:e2e
```

Use `PREVIEW_PORT=3127 npm run start:preview` to start that server after building it.
Without `E2E_BASE_URL`, Playwright starts the configured local preview according to [playwright.config.ts](playwright.config.ts).
CI generates explicitly synthetic audio only in an isolated, unconfigured workspace.
The synthetic-fixture script overwrites local prepared data and must never run over a real catalogue or be deployed.
Authenticated browser journeys use synthetic Auth/API fixtures to test real components without sending email or editing production data.

Browser coverage includes discovery and final-page pagination, search and filters, playback and seeking, queues, locale changes, playlists, downloads, offline recovery, dialogs and personal forms.
Binaural signal tests render the real browser OfflineAudioContext and inspect stereo frequency amplitudes and leakage.
Those tests verify generated audio signals, without claiming brainwave synchronization or physical headphone output.
Graphics tests cover renderer failure, context loss, unsupported workers, slow rendering, preference changes and cleanup.
Motion checks cover reused results, repeated dialog focus restoration and reduced-motion/Calm paths.

### Graphics budgets and asset generation

```bash
npm run garden:posters
npm run build
npm run garden:budget
```

Poster generation renders the actual runtime scenes through installed Playwright Chromium and creates responsive AVIF/WebP assets.
It does not access cloud audio or use a paid generation service.
Prompts, provenance and licenses are recorded in [content/garden-assets.json](content/garden-assets.json).
The budget check measures emitted graphics chunks, including dependencies and workers, against **220 KiB gzip**.
Each selected mobile poster must remain **80 KiB or less**.
Generated shell assets are rebuilt through `scripts/build-shell.mjs`, which also runs before normal builds.
Edit source translations or service-worker code and regenerate their outputs instead of editing generated files directly.

### Mobile listening measurements

Run the performance tools against an optimized preview:

```bash
npm run test:performance -- --base=http://127.0.0.1:3127 --samples=30 --theme=day --routes=/vi,/vi/explore --label=day
npm run test:performance:binaural -- --base=http://127.0.0.1:3127 --samples=30 --theme=day --label=day
```

Repeat with `--theme=night` and a distinct report label.
The target is **p95 usable listening controls and click-to-audio at or below three seconds**, using at least 30 fresh samples per principal scenario.
The agreed profile is 390 × 844, 150 ms latency, 1.6 Mbps download and 4× CPU slowdown.
Live-scene readiness is reported separately because decorative 3D must not gate listening.
Reports also include LCP, CLS, sampled interaction timing and transferred resources.
Sampled interaction timing is not field INP, and page-target network accounting can omit worker transfers.
Cloud audio samples must stay within verified free egress and operation allowances.

Local automated, deployed-cloud, physical-device and actual screen-reader evidence must be reported separately.
Actual NVDA, VoiceOver/TalkBack, iPhone/Android, headphone output, screen-lock playback, production SMTP, deployed performance and managed-backup restoration remain separate acceptance checks until performed.

## Deployment and recovery

The existing Vercel project is `healingmuse`, connected to the existing GitHub repository.
The configured production branch is `main`, and the canonical domain is `healingmuse.vercel.app`.
Use Node.js 22 and retain the Singapore function region in [vercel.json](vercel.json).

1. Put changes on a feature branch and run the relevant validation checks.
2. Configure the existing Supabase and canonical-origin variables privately in the appropriate Vercel Preview and Production environments.
3. Keep `LOCAL_CATALOG_ENABLED=false` and exclude local audio, credentials, evidence and fixtures from deployment.
4. Open a pull request and inspect the GitHub validation and Vercel preview status.
5. Verify a protected preview through the owning account when Vercel protection is enabled.
6. Let the owner review and merge into `main`.
7. Verify the resulting Ready production deployment at the canonical public domain.

Vercel's [Git deployment workflow](https://vercel.com/docs/git) handles deployment without a local CLI login.
Public build-variable changes require a fresh deployment; use a clean rebuild when diagnosing stale embedded configuration.
The normal production site should not require Vercel's preview login.
Retain the previous deployment for recovery and distinguish application rollback from database or content-release recovery.
Content publication remains an administrator-controlled action, independent of code deployment.
Never create a duplicate Vercel project or force-push to repair deployment settings.

## Troubleshooting

| Symptom                           | Check                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No recordings in production       | Confirm cloud configuration, `LOCAL_CATALOG_ENABLED=false`, applied schema and publication state; uploaded drafts are not public. |
| Sign-in form unavailable          | Confirm public Supabase variables existed at build time, then rebuild the existing deployment.                                    |
| Email link opens localhost        | Correct Supabase Auth Site URL, exact recovery redirects and the production canonical origin; request a fresh link.               |
| `over_email_send_rate_limit`      | Respect the existing limit and inspect the sender configuration; repeated requests will not repair delivery.                      |
| Public users cannot receive email | Configure an approved production sender; the built-in sender is limited to authorized development recipients.                     |
| Content studio asks for sign-in   | Confirm the app session on the canonical origin and the server-controlled content-administrator role.                             |
| Playback becomes unavailable      | Retry for a fresh grant, check publication/storage availability, or use an explicit device download.                              |
| Background music will not mix     | Check hosted-source support, CORS and autoplay; tone-only or ordinary playback remains available.                                 |
| Scene stays still                 | Check Calm, reduced motion, Still, Save-Data, graphics support and automatic quality fallback.                                    |
| Download disappeared              | Check device/browser storage, eviction and whether the same browser profile is being used.                                        |
| Preview asks for a Vercel login   | Use the owning-account preview session; this gate is separate from HealingMuse authentication.                                    |

Share error codes and visible states when reporting a problem.
Do not share credentials, email codes, full authentication links, private signed audio URLs or database connection strings.

## Contributing and licensing

Preserve recording IDs, publication requirements, attribution and patient-data policies.
Keep playback independent of decorative effects, and test reduced motion, both themes, both languages and small screens when changing the interface.
Reproduce a bug through the closest available end-user journey before implementing its fix.
Use the existing component and icon systems, keep credentials and artifacts ignored, and regenerate files through their source workflows.
Do not manually edit generated files or changelogs, and do not add agent coauthors to commits.
Write full sentences on separate lines in long Markdown files.

Application source is distributed under the [MIT license](LICENSE).
Music and third-party artwork retain their individual licenses and attribution requirements.
See recording details, the Credits page, [audio source metadata](content/audio-sources.json), [artwork credits](content/artwork-credits.json), [scenery credits](content/scenery-credits.json) and [garden provenance](content/garden-assets.json).
Development-generated decorative concepts are distinct from the human-created music catalogue.
