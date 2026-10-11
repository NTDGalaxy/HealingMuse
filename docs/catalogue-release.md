# HealingMuse catalogue and release evidence

This report records implementation and verification on 10 October 2026 in the Asia/Saigon timezone.
It supplements the earlier verification report, which described the original twenty-recording catalogue.

## Prepared inventory

There are 1,000 eligible prepared recordings and 1,002 retained inventory entries.
The original twenty recordings retain their IDs, files and checksums.
Two publisher-labelled shortened versions of Easy Lemon were retired and replaced, and their originals and exclusion evidence remain retained.
Prepared audio covers approximately 53.82 hours and requires 4,638,015,135 bytes.
Preparation does not confer human listening approval or public release.

| State | Count |
| --- | ---: |
| Eligible prepared recordings | 1,000 |
| Excluded shortened versions retained for evidence | 2 |
| Existing cloud drafts | 20 |
| Human listening and rights approvals | 0 |
| Published cloud recordings | 0 |

The catalogue combines twenty retained initial sources, 128 additional Wikimedia Commons sources and 852 Incompetech sources.
Its credits contain 43 recorded names, including spelling variants, rather than 43 verified distinct artist identities.
Kevin MacLeod accounts for 913 recordings, so this initial inventory remains heavily weighted toward one composer.
Publisher evidence supports genre tags on 703 recordings across twenty represented genre identifiers.
Instrument tags include piano, guitar, strings, flute and percussion.
Nature families currently contain forest 38, river 21, rain 24, sea 2 and night 2 recordings.
Tradition tags remain empty until their classifications are verified, and this inventory does not establish representative Vietnamese or global tradition coverage.
The publisher labels fifty candidates as Horror, five as Stings and ninety-four as Unclassifiable.
Those entries require particular attention during human listening review and have no suitability or publication approval.

The detailed counts are generated in [catalogue-report.json](../media/evidence/catalogue-report.json).
Individual receipts in `media/evidence/recordings/` retain source metadata, original and prepared checksums, licence evidence, attribution, transformation notes and technical results.
[Publisher classification evidence](../media/evidence/publisher-classification.json) retains the original genre labels and review flags.
[Identity exclusions](../media/evidence/identity-exclusions.json) record why shortened versions do not contribute to the target.
The decoded-audio audit checks exact whole-audio hashes and five-second PCM block overlap alongside source identifiers and provenance.
Different lossy encodings and fractional-second edits can evade exact PCM comparisons, so the audit cannot replace provenance checks or human review.

## Preparation and delivery workflow

Use Node.js 22 and the existing npm dependencies.
Discovery and preparation accept targets between 1,000 and 10,000 eligible recordings.
Candidate pools may exceed the target because duplicate, derivative and unsuitable sources are rejected.
Atomic checkpoints, per-record receipts, bounded workers, process ownership and persisted provider cooldowns make interrupted runs resumable.
Re-running preparation preserves verified existing bytes and IDs.

```sh
npm run audio:discover -- --target 1000
npm run audio:import -- --target 1000 --concurrency 2
npm run audio:classify
npm run audio:verify -- --target 1000
npm run audio:audit
npm run audio:upload -- --target 1000
```

The final command performs a read-only Storage preflight unless `--upload-drafts` is supplied.
The current private bucket has a 52,428,800-byte per-file limit, and no eligible prepared file exceeds it.
Delivering the remaining drafts requires 4,564,534,153 additional bytes.
Available project capacity is unconfirmed, so no bulk cloud upload was performed.
Set `SUPABASE_STORAGE_AVAILABLE_BYTES` only after checking the actual available project quota and existing usage.

```sh
npm run audio:upload -- --target 1000 --upload-drafts
```

Draft delivery never overwrites existing objects or recording IDs silently.
It verifies local and remote checksums, detects collisions and checkpoints successful deliveries.
Uploaded metadata always starts as a draft with human listening and rights approval disabled.
In Content studio, search or filter review rows, preview the recording, inspect its source and licence evidence, and explicitly confirm human creation, distribution rights and completed listening review.
Save an approved draft or select publication status and save after reviewing all publication requirements.
The explicit rejection action retires the recording and clears its listening and rights approval flags.
Only sufficiently approved recordings can advance the public catalogue toward the 1,000-recording release goal.

The Wikimedia importer sends `HealingMuseBot/1.0 (https://github.com/NTDGalaxy/HealingMuse/issues)`.
Metadata requests are paced, downloads use one Wikimedia worker, and HTTP 429 plus numeric or dated Retry-After responses retain provider cooldowns.
[Wikimedia preflight evidence](../media/evidence/wikimedia-preflight.json) records a successful real download and decode with the configured contact.
Recording rights evidence follows [Wikimedia reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) and [Incompetech's documented licensing](https://incompetech.com/music/royalty-free/licenses/).
Six human-created photographs retain source, author, licence and transformation details in [artwork credits](../content/artwork-credits.json), exposed through the application's credits page and embedded image metadata.

## Application architecture

The root layout mounts persistent providers and the player without waiting for the catalogue.
Home's introduction, search and category navigation also render outside the catalogue's streaming boundary.
The main reading area reserves a viewport-height floor so its footer cannot jump into view when streamed catalogue content changes.
Route content streams through loading boundaries, and optional dialogs load when opened.
Only the active locale's messages are initially supplied.
The approved visual direction and implemented tokens are recorded in [DESIGN.md](../DESIGN.md) and [.impeccable/direction.md](../.impeccable/direction.md).
The fresh visual review was limited to two requested Home and mood-control corrections, both resolved, and does not constitute full-product usability acceptance.

`GET /api/catalog` returns `{items, total, nextCursor}` with 24 recordings by default and a maximum of 48.
`GET /api/tracks?ids=...` resolves at most 100 published recording IDs per request.
Search and filter state lives in the URL, while queues, playlists and favorites resolve metadata independently of the current browse page.
Database filters are parameterized and indexed, Vietnamese search folds accents and đ/d, and cursors order by `(position, id)`.
The discovery migration explicitly revokes default API-role privileges and preserves publication RLS.
Cookie-independent published metadata alone has a sixty-second server cache, with content-change invalidation.
Playback and download grants perform fresh single-record publication checks.

The server-only HTTPS transport pools verified TLS connections, bounds deadlines, propagates cancellation and falls back between resolved addresses.
IPv4 resolution is attempted before IPv6 after reproducing the local dual-stack DNS delay.
Browser transport remains unchanged.
Private responses remain no-store, and the service worker caches only its public offline-shell allowlist.
Only explicit, rights-compatible recording downloads persist locally; mood records and offline personal mutations do not.

## Verification and measured conditions

The audio integrity report covers all 1,002 retained MP3s, including 1,000 eligible recordings, with schema, byte-length, SHA-256 and complete decoding checks.
Database tests cover both 1,000- and 10,000-row isolated fixtures, records beyond row 1,000, Vietnamese accents, retirement, bounded queries, API privileges and human-review publication constraints.
Live cloud checks verify eight migration hashes, thirteen RLS tables, private Storage, guest denial, administrator isolation and twenty uploaded drafts matching retained metadata.
Synthetic live database checks run inside rolled-back transactions.
Live Auth settings, catalogue RPC and Storage signing passed through the verified transport at 561, 1,016 and 841 milliseconds respectively in the retained integration sample.
These checks do not establish live email delivery, authenticated browser sessions or private Realtime reconnection.

Before implementation, a development Explore navigation took 5,875 milliseconds and cold Home compilation took 37,804 milliseconds in this WSL workspace.
After implementation, warm configured development navigation took 439 milliseconds for Home and 362 milliseconds for Explore.
First compilation still took 7,915 milliseconds for Explore and 4,016 milliseconds for Library in that development run.
The live published catalogue was empty in those measurements, so they establish shell and empty-catalogue behavior rather than a deployed 1,000-recording cloud benchmark.
The before and after navigation samples remain in `artifacts/navigation-before.json` and `artifacts/navigation-after-development.json`.

Final production browser and performance results are retained in `artifacts/browser-results.json`, `artifacts/page-performance.json` and `artifacts/playback-load.json`.
The final validation run passed lint, formatting, strict TypeScript, twenty unit tests, the configured production build and the client-secret scan across thirty-two client files.
All twenty-nine browser journeys passed with no skipped, failed or flaky tests and no retries.
Playback startup measured 847 milliseconds at p95 with twenty-five simultaneous listeners in the warm, unthrottled local production preview, without concurrent builds or test jobs.
The final mobile preview sample used five fresh Chromium contexts per scenario at 390 by 844 CSS pixels.
Unthrottled LCP was 80 milliseconds at the median and 476 milliseconds at p95, with zero CLS.
With configured 150-millisecond network latency, 1.6 Mbps throughput and four-times CPU slowdown, LCP was 680 milliseconds at the median and 940 milliseconds at p95, with maximum CLS 0.0444.
The recording-control readiness measurement under that throttle was 3.14 to 3.15 seconds and is distinct from LCP; the native search and category links render earlier.
An earlier throttled run exposed CLS 0.296 when the footer jumped during streamed content replacement.
The affected elements and timings remain in `artifacts/layout-shift-reproduction.json`, and the final viewport floor and stable introduction resolve that regression in the repeated sample.
The production preview uses the 1,000 eligible local recordings and an isolated `.next-preview` output directory.
Its measurements must be distinguished from a deployed application and physical-device results.
The browser suite exercises continuous playback, locale navigation, signed-grant recovery, playlists, distant favorites, rapid filters, queue extension, downloads, offline startup and review/publication gates.
Vietnamese and English automation includes phone, tablet and desktop layouts, keyboard focus, axe checks, readable personal-screen prose, reduced motion and zoom-equivalent reflow geometry.
Viewport emulation is not a physical browser zoom or screen-reader test.
Actual NVDA, VoiceOver, TalkBack, physical-device, screen-lock playback and deployed Vietnam-network performance checks remain pending.
Public release also requires human listening and rights approvals plus confirmed Storage capacity for draft delivery.

## Sanctuary release implementation - 10 October 2026 UTC

The user confirmed that the human listening, provenance and rights reviews were completed and approved the sanctuary release plan.
That confirmation has not yet been recorded as an authenticated administrator attestation in the application.
The existing cloud inventory contains twenty drafts and zero published recordings.
The explicitly designated existing account was verified as authenticated and confirmed, then received catalogue administrator access.
Administrator designation grants no patient mood access and does not approve the release.
The public homepage and catalogue endpoint at `healingmuse.vercel.app` return Vercel `404: NOT_FOUND`.
The user selected GitHub-integrated deployment through the existing `NTDGalaxy/HealingMuse` repository.
No Vercel CLI login is required, and the user will review and merge the feature-branch pull request into the configured Production Branch.
The repository previously contained only its README and licence; the application is prepared against that existing history.

The new release migration is applied to the existing Supabase project.
Release tables explicitly revoke default privileges from PUBLIC, anon, authenticated and service_role before granting narrowly scoped access.
Administrator RLS protects release summaries and audits, while existing owner policies continue to protect personal records.
The verified delivery worker pins each checksum to a Storage object ID and update timestamp.
Publication locks the manifest, recording metadata and delivery versions, then records approvals and publishes the complete set in one transaction.
Changed manifests, metadata, retired tracks, replaced audio and incomplete deliveries are rejected.
Repeated submissions return the original publication receipt without overwriting the reviewer or publishing tracks again.
The audit retains each recording's prior publication and approval state for recovery.

The immutable local manifest contains exactly 1,000 eligible recording IDs, audio checksums, paths, byte sizes and reviewed metadata.
The two retired shortened versions are excluded.
Its ID is `30ea9baa-aedf-41f7-8119-3ecebe56e242` and SHA-256 is `0daaa24a8a9cb1feab65396d217e749363d8ed9f8ebfa6cf481d0acc0fbbf81e`.
The generated manifest is retained in `media/evidence/catalogue-release.json` and must not be edited manually.
All twenty existing cloud draft metadata snapshots match the prepared inventory.

Remaining delivery is paused at the user's request because the existing Supabase Free organization includes only 1 GB of Storage.
The inventory requires approximately 4.64 GB in total.
No paid change or remaining upload was initiated.
Review [storage-options.md](storage-options.md), obtain the owner's approval for the selected option, and verify actual capacity before running the following Supabase delivery commands.

```sh
npm run audio:upload -- --target 1000 --upload-drafts
npm run release:register
```

Delivery verifies existing objects as well as newly uploaded objects and records their verified versions.
Manifest registration refuses incomplete delivery or metadata differences and never publishes recordings.
The designated administrator account is already configured.
No other user was granted administration.
Then sign in to Content studio, review the release counts and manifest hash, enter the reviewer's full name, and confirm the three completed reviews.
The publication endpoint derives the reviewer UUID from the signed-in account.
No API request accepts a supplied reviewer UUID.

Six decorative landscapes and their responsive variants are shipped under `public/scenery/`.
Prompts, provenance, original checksums and encoded sizes are recorded in [scenery-credits.json](../content/scenery-credits.json).
The original generated files remain in the excluded `.local/sanctuary-originals/` directory.
The six human-created recording photographs are preserved.
Decorative images were generated during development with the selected built-in image tool; the deployed application has no AI APIs and music remains human-created.
Phone AVIF scenery ranges from 12.2 to 20.0 KiB per scene.
To replace scenery later, supply artwork with documented rights, retain the scene IDs and responsive filenames, encode at 480, 960 and 1,600 pixels, and update its provenance rather than retaining the generated-artwork description.
Keep the phone initial-view variant below 80 KiB and archive replacement originals outside the deployment payload.

Frosted navigation, search and player surfaces use bounded blur over the landscapes.
Opaque reading surfaces and dark plum text support reliable contrast.
Native filter disclosures keep recording choices visible in the first phone viewport.
Heading entrances, section reveals and shallow parallax preserve native scrolling, visible server-rendered content and continuous playback.
Calm mode and reduced-motion preferences disable decorative motion, while reduced transparency removes frosted blur.
Separating catalogue taxonomy from server query validation removes eager schema construction from the discovery client bundle.

Portable database tests passed atomic publication of 1,000 synthetic recordings, authorization denials, changed manifests and metadata, missing and replaced audio, retirement, idempotency and audit recovery states.
Live read-only checks passed release-table privileges, administrator RLS and the separation of service-only delivery receipts from authenticated publication.
Existing live security checks passed inside a synthetic transaction that was rolled back.
No synthetic account or recording remains from those tests.

Deployment uses the existing project's GitHub integration and the feature-branch review workflow in [deployment.md](deployment.md).
Keep Node.js 22, the Next.js configuration, Singapore functions and canonical production origin.
Configure existing Supabase settings through protected Vercel environment fields.
Git and deployment exclusions keep credentials, local audio archives, originals and browser evidence out of delivery.
The user reviews the pull request, verifies the configured Production Branch and merges it themselves.
The integration then creates the production deployment automatically.
Retain the previous deployment, when available, and the release audit for recovery.
Do not restore previous publication states over later catalogue edits; compare current metadata with the release snapshot before transactional recovery.
Repeat catalogue, playback, headers and performance checks at the canonical public URL after the deployment is Ready.

An actual configured-app browser reproduction exposed same-origin mutations rejected with 403 because the internal listener address differed from the browser-facing Host.
The corrected origin check uses the Host and framework protocol, rejects malformed targets and ignores untrusted forwarded hosts.
The same valid guest submission now reaches the intended 401 authentication boundary, while hostile-origin and forged-forwarded-host submissions remain rejected.
No real release was approved or published during that check.

Rapid browser recording switches and closing tabs under the mobile throttle reproduced a Node stream-adapter cancellation race.
The local audio response now pulls from the file asynchronously, destroys the source on cancellation and checks cancellation before delivering pending chunks.
Unit checks cover complete delivery, late chunks during cancellation and genuine read errors.
The repeated fifteen-journey throttled browser reproduction recorded zero new server exceptions and zero browser errors, compared with seventeen server exceptions before the fix.
The preview build wrapper also treats signal-terminated builds as failures rather than reporting a false zero exit status.

On 11 October 2026, final local validation passed lint, formatting, strict TypeScript, twenty-seven unit tests, the foundation, catalogue and release database suites, configured and preview production builds, and the client-secret scan across thirty-two client files.
All thirty-four browser journeys passed with no skips, failures, retries or reported flakiness.
The browser suite traversed every eligible recording ID through bounded pages, checked the final page and ID lookup, and exercised search, filters, playback, queues, locale changes, playlists, downloads, publication review and offline recovery.
Release database tests verified atomic publication of a 1,000-recording synthetic fixture and rejected unauthorized, changed and incomplete requests.
Repeated submissions returned the original publication receipt with preserved audit states.

Desktop, tablet and phone captures cover ten routes in both Vietnamese and English.
The independent finish reviewer inspected representative captures, requested task-specific sign-in explanations and improved credits spacing, then verified both corrections across eighteen fresh captures.
That verdict covers the scored correction batch rather than an approved visual comp comparison.
During documentation, browser reproduction also exposed destructive-button hover contrast of 1.12 to one and an old forest-green offline header.
The corrected hover passed axe contrast checks, and the same offline navigation showed the sanctuary palette.
Targeted mood erasure, offline playback and service-worker update journeys passed after those corrections.

The compiled scenery component is 1,051 bytes compressed with gzip.
Its entire containing module, including existing navigation code, is 4,152 bytes compressed and remains below the 10 KiB added-motion budget.
These values exclude the existing shared React runtime and are retained in `artifacts/motion-budget.json`.
No new motion dependency was introduced.

Final mobile measurements after the cancellation fix are retained in `artifacts/performance-sanctuary-cancellation-final.json`.
The earlier completed measurement remains in `artifacts/performance-sanctuary-final-confirmed.json` for comparison.
They use thirty fresh browser contexts for each principal listening entry page, Home and Explore, at 390 by 844 CSS pixels, 150-millisecond latency, 1.6 Mbps download throughput, 0.75 Mbps upload throughput and four-times CPU slowdown.
Browser HTTP caching is disabled and service workers are blocked during measurement.
Page readiness requires a hydrated, visible and actionable recording choice with the persistent native audio element mounted.
Click-to-audio measures the real recording-button click through the native playing event.
The report includes p95 LCP, maximum cumulative layout shift and single-click Event Timing duration; the latter is an interaction latency sample rather than a field INP measurement.
No builds or browser test jobs run concurrently with the final measurements.
These are local production-preview measurements against the 1,000-recording local inventory rather than deployed Supabase playback measurements.

| Principal page | Samples | Readiness p95 | Click-to-audio p95 | LCP p95 | Maximum CLS | Click Event Timing p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 30 | 2,466.8 ms | 859.4 ms | 1,980 ms | 0.0444 | 48 ms |
| Explore | 30 | 2,544.7 ms | 1,388.8 ms | 2,048 ms | 0.0764 | 40 ms |

Both page-readiness and click-to-audio p95 measurements pass the three-second local gate.
The deployed candidate and final canonical origin must pass that same gate before the production performance requirement can be reported as satisfied.

The environment example contains empty credential placeholders and the canonical public origin.
Git excludes environment secrets, credentials, local tool configuration, raw audio archives and test artifacts.
No public domain change or remaining recording delivery occurred.
Remaining delivery requires 4,564,534,153 additional audio bytes and stays paused until the owner approves sufficient storage.
The configured catalogue stays empty until verified delivery, manifest registration and the authorized administrator's named attestation are complete.

Live Supabase migration and authorization evidence is separate from automated browser and database-fixture evidence.
Physical-device, actual NVDA, VoiceOver and TalkBack, screen-lock playback, live authenticated browser sessions, public deployment and deployed performance checks remain pending.
