# HealingMuse

HealingMuse is a Vietnamese-first, English-supported music and wellbeing PWA for adult cancer patients.
It offers recreational listening and emotional support without treatment claims.
The application contains no AI models, generation, chatbots, transcription, or AI APIs.
The published production catalogue contains 348 human-created instrumental recordings.
Decorative botanical environments are created during development and contain no runtime AI services.

## Run locally

Use Node.js 22 and npm.
Copy `.env.example` to `.env.local` when configuring an existing Supabase project.
Keep credentials out of Git and chat.
Guest listening works locally with prepared recordings before cloud credentials are configured.
Account features require a real Supabase project.
Email and password are the default sign-in method, with email codes available as an optional fallback.
Use `npm run dev` for the configured cloud app and `npm run dev:preview` for isolated local listening without changing `.env.local`.

```bash
npm ci
npm run audio:import
npm run audio:verify
npm run dev:preview
```

Open `http://localhost:3000/vi` or `http://localhost:3000/en`.
The import runs outside the application runtime and retains originals and license evidence under `media/`.
If Wikimedia requests a cooldown, wait for that interval and rerun the import.
Completed source downloads are reused.
Do not publish the local preview catalog to patients before completing the subjective listening review.
Production uploads create drafts with the review flag off.

## Features

- Guest browsing, search, listening goals, hosted playback, recording credits, and eligible downloads.
- Persistent native audio player, seeking, queue navigation, repeat, Media Session controls, and sleep timer.
- Guest binaural listening with real stereo synthesis, twelve presets, timed sessions, optional instrumental backgrounds, independent mixing and device-local preferences.
- Optional email-and-password accounts, email-code fallback, password recovery, favorites, revision-protected playlists, and private synchronization.
- Separate consent for optional paired mood check-ins, immediate deletion, and 90-day retention.
- Device-local IndexedDB recordings with attribution, download progress, removal, and offline startup.
- Content studio for draft, preview, publication, retirement, rights review, order, and curated collections.
- Vietnamese and English interface, keyboard controls, accessible dialogs, reduced motion, and calm mode.
- User-initiated visible YouTube embeds and ordinary Spotify links when an administrator adds them.

## Botanical world

Every application route has a distinct original Three.js garden with matching day and night posters.
Appearance follows the device by default and can be changed in Your garden or Settings.
Automatic 3D reduces resolution and detail when rendering remains slow, then uses the matching still.
Still garden reduces graphics work and data use.
Calm mode and reduced motion stop decorative animation without interrupting listening.
Reduced transparency replaces frosted surfaces with opaque fills.

The renderer starts independently alongside ordinary controls.
Only one garden is active, with capability-tested worker rendering and a lightweight main-thread fallback.
Ordinary music continues across routes; Binaural pauses when leaving its page.
Search, filters, grants, authentication and all recording rights retain their existing contracts.

`npm run garden:posters` renders responsive AVIF and WebP posters from the actual runtime scenes.
This development command requires installed Playwright Chromium and does not access cloud audio.
`npm run garden:budget` checks emitted graphics chunks against 220 KiB gzip and mobile posters against 80 KiB each.
Asset provenance is recorded in `content/garden-assets.json`.

Use the performance scripts against an optimized production preview with `--samples=30 --theme=day` or `--theme=night`.
`test:performance` accepts `--routes=/vi,/vi/explore` and `--label=<name>`.
`test:performance:binaural` measures generated signal and also accepts a theme and report label.
Page readiness, click-to-audio, live-scene readiness, LCP, CLS and sampled interaction timing are separate measurements.
The three-second p95 gate applies to usable listening controls and audio at 390 x 844, 150 ms latency, 1.6 Mbps download and fourfold CPU slowdown.
Local browser evidence does not establish physical-device, actual screen-reader or deployed-cloud performance.

## Account access

Existing confirmed users can sign in with their email and password without requesting an email each time.
Passwordless users can sign in once with an email code and select Set or change password in Settings.
Forgot or need to set a password requests a recovery email and returns to a localized password page in the same browser.
Supabase handles password storage and authenticated updates; application database tables do not store passwords.
Guest browsing and listening remain available without an account for published recordings.

Before testing recovery, allow these exact production redirects in Supabase Authentication > URL Configuration.
Keep the Site URL set to `https://healingmuse.vercel.app` and add exact preview equivalents only when needed.

```text
https://healingmuse.vercel.app/en/reset-password
https://healingmuse.vercel.app/vi/reset-password
```

The optional Magic Link template uses `{{ .Token }}` for email-code entry.
The separate Reset Password template must retain its secure `{{ .ConfirmationURL }}` recovery link.
Normal password sign-in does not send email, but account confirmation, email codes and recovery still depend on verified delivery and existing sending limits.
Keep email confirmation, administrator authorization, SMTP settings and rate limits unchanged under the current release policy.
The built-in Supabase sender is restricted to authorized organization-team development recipients; public account onboarding still requires an approved production sender.
See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) and [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Binaural listening

Open `/en/brainwave-entrainment` or `/vi/brainwave-entrainment` without signing in.
Choose Beta (14-30 Hz), Alpha (8-13 Hz), Theta (4-7 Hz) or Delta (0.5-3 Hz), then explicitly start a session.
The default left carrier is 200 Hz; the right oscillator adds the chosen difference and reaches the other stereo channel through a separate merger input.
Session lengths include 5, 10, 15, 20, 30, 45 and 60 minutes, with custom whole-minute lengths from 1 to 120.
Leaving the page pauses the session, and returning requires Resume.
Phone background and screen-lock playback are best effort; browser or operating-system interruptions require explicit resumption.

Tones run locally through Web Audio, with no uploaded tone files, paid services, listening-history collection or database changes.
The engine loads only when its page is visited and creates its AudioContext only on Start.
The visible background catalogue includes every published recording, with the same search, category, listening-goal, musical-style, instrument and tradition controls as Explore.
Both pages share the search/filter component, and online results use the same catalogue API.
Catalogue results load as the listener scrolls toward them, with 24 recordings per page, a total count, previous/next navigation and clear filters.
The existing 348-recording catalogue spans 15 pages, with 12 recordings on the final page.
Recording cards retain favorites, eligible downloads and recording credits; choosing a hosted recording selects it for the mixer and exposes a link back to session controls.
Background audio loads through the normal private playback-grant endpoint or a previously downloaded device-local Blob.
Offline search and filters reuse the local catalogue matcher and show only explicit device downloads.
Background failures leave tone-only controls available, and starting either player pauses the other.
Browser CORS and autoplay support remain necessary for mixing streamed music; unsupported browsers can use ordinary music.
Fresh offline navigation opens the existing downloaded-music shell; the binaural page must already be open to start tones without a connection.
Opt-in preferences store settings, preset favorites and a recording ID locally, without private playback URLs or session history.

The audio-clock deadline stops both oscillators and fades the mix even when UI timers are throttled.
Parameter ramps avoid abrupt changes, and bounded mix gains leave digital headroom; application volume percentages cannot measure headphone sound pressure.
Use stereo headphones at low device volume, take breaks, and stop with discomfort.
Band names describe EEG associations, with no promise that listening produces a matching brain state or treats an illness.
The educational wording follows the [2023 systematic review](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023) and [WHO safe-listening guidance](https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-safe-listening).

`tests/unit/binaural.test.ts` checks configuration boundaries, audio-clock timing, interruptions, rapid actions and cleanup.
`tests/e2e/binaural.spec.ts` renders all twelve presets and a 0.5 Hz difference through the real browser OfflineAudioContext and checks expected-channel amplitudes and cross-channel leakage.
These signal checks do not verify brainwave synchronization or subjective effects.
Browser tests also cover guest controls, navigation pause, settings, background playback and automated accessibility.
The catalogue browser suite walks all 348 isolated fixture recordings, verifies final-page selection and backward navigation, and exercises combined filters, Vietnamese search, rapid changes and bilingual layouts.
Use `npm run test:performance:binaural -- --base=http://127.0.0.1:3107 --samples=30` against a production preview to measure cold readiness and click-to-rendered-signal latency at the agreed mobile throttle.
The analyser measures generated audio frames rather than physical headphone output, and sampled interaction timing is distinct from field INP.
Physical iPhone/Android, actual assistive technology and deployed-cloud checks remain separate release validation.

## Validate

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run db:test
npm run build
npm run security:client
npx playwright install chromium
npm run test:e2e
npm run test:load
```

Browser tests use prepared local recordings and an isolated preview server.
For production-mode browser checks, run `npm run build:preview` and start with `npm run start:preview`.
These commands isolate public Supabase configuration without changing `.env.local`.
Use `E2E_BASE_URL` to select that server explicitly.
The personal-feature browser harness renders the actual components with synthetic Auth and API fixtures.
It tests forms, playlist conflicts and ordering, paired check-ins, deletion, and accessibility without sending email or changing cloud data.
CI uses explicitly synthetic audio fixtures in an isolated, unconfigured environment.
Never deploy CI fixtures.
Database tests apply the actual SQL migration to portable PostgreSQL with synthetic Auth, Storage, and Broadcast infrastructure.
Those tests verify SQL behavior but do not replace a live Supabase acceptance run.
Actual NVDA, VoiceOver, TalkBack, Android, iPhone, screen-lock playback, SMTP delivery, production load, and managed backup restoration are release gates.

## Delivery milestones

| Milestone                  | Implementation                                                                                                                   | Remaining validation                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Accessible listening       | Listening screens, two languages, native player, navigation, search                                                              | Representative usability review and actual screen readers                                     |
| Personal features          | Password Auth, email-code fallback, recovery, library, paired check-ins, consent, recent summaries, applied owner RLS, Broadcast | SMTP-dependent onboarding and recovery, live authenticated API and channel journeys           |
| Offline and administration | IndexedDB library, shell, recovery, content studio, imports                                                                      | Human audio review, external-source/device checks, live publishing                            |
| Production delivery        | CI, migrations, deployment configuration, load tools, recovery tools, runbook                                                    | User's GitHub/Vercel deployment, staging restoration, cloud load targets, participant rollout |
