# Implementation and validation evidence

This record describes checks performed on 9 October 2026.
HealingMuse's implemented features and curated recordings contain no AI models, generation, chatbots, or AI APIs.
Deployment to Vercel remains an owning-account step through GitHub.

## Completed implementation

The Vietnamese-first application includes English support, guest listening, search, a persistent native player, seeking, queues, repeat, a sleep timer, and Media Session controls.
Account features include email-code authentication integration, favorites, revision-protected playlists, consented paired check-ins, seven-day personal summaries, immediate erasure, and private Realtime invalidation.
Offline features include explicit eligible downloads, complete-file verification, IndexedDB attribution, storage management, a separate public shell, local playback, and a timer.
Content administration includes draft preview, publication gates, retirement, rights review, ordering, and curated collections.
CI, tracked migrations, load tools, recovery tools, deployment instructions, and the maintenance runbook are included.

## Automated and visual checks

| Check | Evidence |
| --- | --- |
| Lint, formatting, strict TypeScript | Passed |
| Unit and CLI integration tests | Nine passed, including unsafe object collision and failed staging-account cleanup |
| Production build | Configured cloud build and isolated listening preview passed |
| Client secret scan | Thirty client files checked against the locally configured server secrets; no matches |
| Dependency audit | Zero known vulnerabilities in the locked tree |
| Browser journeys | Twenty-two passed with zero retries, including guest listening, seeking, navigation, bilingual screens, authentication fixtures, playlists, moods, administration, external video errors, downloads, quota denial, competing transitions, and shell updates |
| Accessibility automation | Axe checks, keyboard dialogs, focus return, complete phone controls, and error associations |
| Visual inspection | Vietnamese and English Home at 390, 820, and 1440 CSS pixels; Vietnamese content dialog at all three widths |
| Audio preparation | All twenty MP3 files decode and match retained local checksums |
| Local recovery rehearsal | Migrated synthetic database restored with erasure reapplication and owner RLS; twenty separately retained originals verified |

The browser account journeys render production components with synthetic Auth and API fixtures.
Those journeys do not establish SMTP delivery or live Realtime channel behavior.
Actual NVDA, VoiceOver, TalkBack, Android, and iPhone checks remain pending.

## Live Supabase evidence

The existing project's public schema, Storage buckets, policies, and default privileges were inventoried before migration.
The database uses certificate and hostname verification through the configured Session pooler.
Seven checksummed migrations were applied transactionally.
All thirteen HealingMuse tables, including migration tracking, have RLS enabled.
The private audio bucket contains twenty uploaded recordings as unpublished drafts.
Every cloud audio copy matches its prepared SHA-256 hash, covering 73,480,982 bytes.
Guest requests cannot download those private objects or execute the server-only rate-limit function.
Both scheduled retention jobs are active.
Real database tests verify consent, paired check-ins, patient ownership, content-administrator isolation, guest denial, playlist conflicts, consent revocation, and account erasure.
Their synthetic identities, recordings, and private records are always rolled back.
No synthetic recording was published outside the test transaction.
Actual retention job execution history, SMTP, authenticated API sessions, private channel reconnection, and concurrent consent changes still require staging acceptance.

## Playback load

The measured scenario used twenty-five simultaneous native-audio listeners against a local production preview with a warm application and unthrottled Linux Chromium.
No other test jobs ran during the measurement.
At 15:59:17 UTC, the playback startup 95th percentile was 811 milliseconds against a 3,000-millisecond target.
The report is retained at `artifacts/playback-load.json`.
This measurement establishes local behavior and must be repeated against staging from a Vietnam-representative network.
The live personal synchronization target remains unmeasured.

## Remaining release gates

Complete the administrator's full listening and distribution-rights review before publishing the twenty drafts.
Configure custom SMTP, sender-domain verification, and the content administrator's real account.
Run authenticated API, private Broadcast, synchronization load, publishing, and retention acceptance in dedicated staging.
Rehearse a managed Supabase restoration and maintain a separately recoverable offsite audio archive.
Complete actual assistive-technology and mobile screen-lock playback tests.
Configure owning-account availability monitoring, usage alerts, and spending controls.
Complete a small representative usability review before participant rollout.
Use the detailed [acceptance matrix](acceptance.md), [deployment instructions](deployment.md), and [runbook](runbook.md).
