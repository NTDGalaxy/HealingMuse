# HealingMuse

HealingMuse is a Vietnamese-first, English-supported music and wellbeing PWA for adult cancer patients.
It offers recreational listening and emotional support without treatment claims.
The application contains no AI models, generation, chatbots, transcription, or AI APIs.
Recordings are human-created instrumentals and recorded nature sounds.

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
- Optional email-and-password accounts, email-code fallback, password recovery, favorites, revision-protected playlists, and private synchronization.
- Separate consent for optional paired mood check-ins, immediate deletion, and 90-day retention.
- Device-local IndexedDB recordings with attribution, download progress, removal, and offline startup.
- Content studio for draft, preview, publication, retirement, rights review, order, and curated collections.
- Vietnamese and English interface, keyboard controls, accessible dialogs, reduced motion, and calm mode.
- User-initiated visible YouTube embeds and ordinary Spotify links when an administrator adds them.

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
