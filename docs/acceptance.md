# Acceptance evidence and release checklist

Automated checks and manual checks must be reported separately.
A passing browser automation scan does not establish screen-reader or physical-device support.

## Automated validation

Run lint, strict type checking, domain tests, migration tests, a production build, and E2E journeys.
Domain tests cover byte ranges, source validation, external download restrictions, playlist revisions, mood input bounds, and language-key parity.
Portable PostgreSQL tests apply the actual migration and verify consent, owner isolation, content administration boundaries, Broadcast topic access, pairing, stale edits, retention, and cascaded deletion.
Browser tests cover guest listening, navigation, seeking, timer selection, downloads, reload, offline startup, removal, keyboard dialogs, search, and uncached APIs.
Recovery tests reproduce failed track transitions, interrupted downloads, quota errors, competing player transitions, and timer expiry.
Browser tests also cover expired grants, complete phone player controls, and waiting shell updates that preserve downloaded playback.
The personal-feature browser harness renders production components with synthetic Auth and API fixtures for sign-in forms, favorites, playlist creation and ordering, stale revisions, paired check-ins, erasure, review-gated publication, retirement, and external video errors.
Those fixture-backed journeys complement SQL authorization tests and do not establish live SMTP, Storage, or Realtime behavior.
Inspect full-page screenshots at 390, 820, and 1440 CSS pixels in Vietnamese and English.
Use axe checks together with keyboard and manual visual inspection.
Do not hide failures behind retries or increase timeouts without addressing the cause.

## Live authenticated checks

Use a dedicated staging project and synthetic accounts.
`npm run db:test:cloud` checks consent, owner RLS, administrator isolation, revisions, and erasure on the real database inside one transaction that always rolls back.
It creates no persistent synthetic users and does not replace real Auth, SMTP, or Realtime channel tests.
Set `STAGING_TESTS_ALLOWED=true` and `STAGING_APP_URL` only for that dedicated staging deployment.
Run `npm run test:live-access` for real API identity, owner RLS, administrator isolation, private channel authorization, consent, paired check-ins, and account deletion.
The script creates synthetic accounts without sending email, then removes those accounts afterward.
Its generated Auth fixtures complement the browser fixtures and provide repeatable synthetic staging data.
Run it only after migrations and a reviewed published staging recording are present.
Test actual email-code request, receipt, invalid code, expiry, resend, successful verification, and sign-out.
Create, reorder, remove from, and delete playlists across two independent browser sessions.
Trigger a stale revision and confirm the user must review the refreshed version.
Enable consent, save a before check-in, listen, save an after check-in, skip either phase, delete history, revoke consent, and delete the account.
Verify immediate interface clearing after sign-out and deletion.
Try the same records as another patient, a guest, and a content administrator through application APIs and direct database SDK calls.
Attempt unauthorized private Broadcast subscriptions and verify no personal payload is received.
Test subscription reconnection and refetch after a connection outage.
Check both the 90-day read boundary and the scheduled physical deletion job.
Test draft preview, reviewed publishing, collection order, retirement, and lack of mood access in Content studio.

## Offline and external checks

Test interrupted transfers, rejected browser storage, exhausted storage, hash mismatch, deletion, browser eviction, and an empty offline library.
Test an installed PWA starting offline after all tabs are closed.
Test a waiting service-worker update with downloaded audio and ensure activation preserves the IndexedDB library.
Test playback after an expired grant, connection loss while streaming, and rapid next/previous actions.
Load a visible YouTube embed only after user initiation and test an unavailable or embedding-disabled video.
Verify no external video download or hidden/background YouTube player is offered.
Test ordinary Spotify links and return navigation.
See [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies) and [browser storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Actual assistive technology

| Platform | Screen reader and browser | Required journeys | Status |
| --- | --- | --- | --- |
| Windows | NVDA with current Chrome and Firefox | Landmarks, headings, catalog, player, forms, errors, dialogs, check-ins | Pending hardware review |
| macOS or iPhone | VoiceOver with Safari | Rotor navigation, touch exploration, player, seeking, focus return, offline library | Pending hardware review |
| Android | TalkBack with Chrome | Swipe order, controls, dialog trapping, labels, authentication, offline playback | Pending hardware review |

Test the actual spoken output in both languages.
Confirm meaningful status announcements and ensure playback position is not repeatedly announced.
Confirm every interactive control has a visible or accessible name and at least a 44 CSS pixel target.
Confirm keyboard operation, visible focus, escape dismissal, and return to the opener for every dialog.
Check 200% zoom, reflow, reduced motion, calm mode, long titles, loading, empty, error, and offline states.
Apply the AAS Accessibility & Inclusive UX `fixing-accessibility` and `screen-reader-testing` instructions.

## Actual mobile audio

Test current Android Chrome and iPhone Safari on physical devices with hosted and downloaded MP3 recordings.
Record the operating-system version, browser version, device, and install mode.
Test navigation during playback, seek, screen locking, Media Session controls, interruption by a phone call, reconnection, and timer expiry while locked.
Browsers and operating systems may suspend background JavaScript, which can affect exact timer deadlines.
Document observed behavior and supported device combinations before promising background timer precision.

## Load and recovery

Run `npm run test:load` with 25 concurrent native-audio browser listeners and retain its JSON report.
The report is saved under `artifacts/playback-load.json`, separately from the browser output directory that Playwright clears between runs.
The defined local scenario uses warm framework compilation and unthrottled Linux Chromium without concurrent test jobs.
Repeat against the production-like staging deployment from a Vietnam-representative network and record latency, bandwidth, caching, browser, audio sizes, and sample count.
Require hosted playback startup at or below three seconds at the 95th percentile under the agreed conditions.
Run `npm run test:sync-load` only with `STAGING_TESTS_ALLOWED=true` in a dedicated synthetic project.
It creates 25 synthetic users, measures private Broadcast invalidation plus refetch, and deletes those users afterward.
Require personal synchronization at or below two seconds at the 95th percentile.
Rehearse a managed database restoration and separate audio restoration using the runbook.
Complete a small representative usability review and address observed barriers before participant rollout.
