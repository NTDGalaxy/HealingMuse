# Deployment to existing projects

Use the user's existing Vercel and Supabase projects.
Do not create new paid projects automatically.
The approved release targets the existing Vercel project `healingmuse` and its canonical origin at `https://healingmuse.vercel.app`.
Use the existing GitHub connection to `NTDGalaxy/HealingMuse`; do not create a duplicate Vercel project.
The user reviews and merges the feature-branch pull request before the integration deploys production.
Vercel CLI authentication is not required for this workflow.
Supabase credentials are configured locally, and the database connection must be reachable before schema setup.
The verified sender domain and SMTP configuration remain owning-account setup steps.

## Prepare Supabase

Confirm the existing project region is suitable for the Vietnam audience.
Singapore is the intended nearby region, and Vercel functions use `sin1`.
If the existing database is elsewhere, assess measured latency before considering a migration.
Use separate staging resources or a Supabase branch for synthetic tests.
Inspect existing policies and grants before applying migrations to a shared project.
Existing broad Storage or Realtime policies must not grant access to HealingMuse's private bucket or topics.

Configure `SUPABASE_DB_URL` with the Session pooler connection string when the direct endpoint is unreachable.
Preserve certificate verification and percent-encode special characters in the database password when necessary.
Run `npm run db:certificate` to download the public root CA from the URL published in [Supabase's dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
The tool verifies that the certificate is a currently valid, self-signed Supabase CA and preserves any existing file.
It stores the certificate under `.local/supabase-ca.crt`, which the database tool detects automatically and which is excluded from Git and deployment.
Alternatively, download the certificate from Database Settings and set `SUPABASE_DB_CA_FILE` to its local path in `.env.local`.
The database tool also accepts a local `sslrootcert` path in the connection URL and always verifies the certificate and hostname.
See [Supabase SSL instructions](https://supabase.com/docs/guides/platform/ssl-enforcement).
Run the read-only inventory first, then apply the repository's tracked migrations.

```bash
node scripts/probe-database.mjs
npm run db:migrate
```

The migrator uses an advisory lock, transactions, and checksums in `public.healingmuse_migrations`.
It refuses to adopt existing application tables without an explicit review.
It refuses a public `audio` bucket and adds restrictive boundaries for this bucket and the `user:` Realtime namespace, preserving unrelated service namespaces.
Do not change applied SQL files; add a new migration for later changes.
If the owning operator uses the SQL editor or Supabase CLI instead, apply every file in timestamp order and use that workflow's migration tracking consistently.
Do not run both tracking workflows against the same schema.
Enable `pg_cron` and verify both retention jobs are present and succeeding.
Do not run destructive resets on the existing project.
Run the live access tests in staging before production.

Enable email authentication and disable unused providers for this pilot.
Use a custom transactional SMTP connection with a verified sender domain, SPF, DKIM, and DMARC.
Set the email template to display `{{ .Token }}` so users receive a sign-in code.
Configure the site URL and allowlisted redirect URLs for staging, production, and localhost.
Set an appropriate short OTP expiry and authentication rate limits in the owning dashboard.
Verify delivery to representative Vietnamese mail providers and test invalid, expired, and repeated codes.
Never enter an SMTP password or Supabase secret in the browser, repository, or chat.

The designated existing account was verified as authenticated and email-confirmed in the existing project.
Only that account received the server-controlled content administrator role.
Future role changes require explicit designation and owner-controlled execution of `npm run content:admin -- --user=<verified-uuid>`.
The account must sign in normally and complete the named review in Content studio; role assignment does not approve a release.

Content administrators receive no patient mood reporting capability.
Require strong protection of the owning Supabase and Vercel accounts and keep that access separate from content administration.

## Import the recordings

Remaining uploads are paused at the user's request because the existing Free plan includes only 1 GB of Storage.
The prepared release requires 4,638,015,135 bytes in total and 4,564,534,153 additional bytes beyond existing objects.
Do not run the delivery commands below until the user approves a storage option and verified capacity is configured privately.
See the current [storage cost comparison](storage-options.md).

```bash
npm run audio:import
npm run audio:verify
npm run audio:upload -- --upload-drafts
npm run cloud:verify -- --audio-bytes
```

The upload script reads `.env.local`, verifies hashes, uses immutable audio names, and creates draft database records.
The read-only cloud verification checks tracked migrations, RLS, active retention jobs, private Storage, denied guest audio access, and uploaded audio checksums.
It never replaces an existing published record.
Store originals, prepared MP3 files, source evidence, and import reports in a separate recoverable audio archive before publishing.
Do not depend on the development machine as the only archive.
Listen to each complete prepared file, verify attribution and distribution rights, and check for speech, intrusive transients, distortion, abrupt endings, and misleading descriptions.
For the 1,000-recording release, follow the immutable manifest and named administrator attestation workflow in [catalogue-release.md](catalogue-release.md).
Run `npm run release:register` after all verified delivery receipts are present, then attest and publish the complete release in Content studio.
The manifest and publication audit preserve recording identities, checksums and previous publication states.
Individual later additions still require listening, provenance and rights review in Content studio.
Assign listening goals, order, and curated collections.
External links may be added after checking the current provider content and behavior.

## Configure Vercel

Open the existing `healingmuse` project in the owning Vercel dashboard.
In Settings, inspect the Git connection and confirm that it points to `NTDGalaxy/HealingMuse`.
In Settings > Environments > Production > Branch Tracking, record the configured Production Branch before merging; the prepared pull request targets the repository's existing default branch, `main`.
If the configured production branch differs, retarget the pull request to that branch before merging.
Keep the existing project and domain assignment.
Use the repository root as the application's Root Directory.
Record the current production deployment for recovery, if one exists.
Do not create a new project or merge the pull request automatically.
Select Node.js 22 in the project settings.
The repository's `vercel.json` selects Next.js and Singapore functions.
Use the locked npm dependencies and the `npm run build` command.
Configure the following environment variables separately for staging and production.

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Owning project's public URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key only |
| `SUPABASE_SECRET_KEY` | Server only | Authorized deletion, grants, and abuse limits |
| `RATE_LIMIT_SALT` | Server only | Random salt for hashed abuse-limit identities |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical HTTPS application origin |
| `LOCAL_CATALOG_ENABLED` | Server only | Keep `false` in patient deployments |

Keep `SUPABASE_DB_URL` local to trusted migration and restoration tools.
Keep `STAGING_TESTS_ALLOWED` off for patient deployments.
Do not deploy originals, evidence archives, CI audio fixtures, backup exports, or local credentials.
Verify HTTPS, security headers, the manifest, service-worker scope, and `private, no-store` responses.
Inspect real Storage responses and ensure private audio cache settings meet the intended grant behavior.
The application validates mutation origins against the browser-facing Host and the framework request protocol.
The hosting ingress must preserve the intended Host and sanitize proxy protocol headers.
Untrusted forwarded-host headers do not bypass origin validation.

### Browser release steps

1. Open the feature-branch pull request in [the existing GitHub repository](https://github.com/NTDGalaxy/HealingMuse/pulls).
Review the changes and wait for the HealingMuse validation check and the existing project's Vercel Preview check.
2. In Vercel Settings > Git, confirm the existing Git connection.
In Settings > Environments > Production > Branch Tracking, confirm the production branch without changing it.
Confirm the root directory, Node.js 22 and the private environment values listed above.
Set `NEXT_PUBLIC_SITE_URL` to `https://healingmuse.vercel.app` for Production and keep `LOCAL_CATALOG_ENABLED=false` for Preview and Production.
Use the Vercel dashboard's protected environment fields, never GitHub source files, to enter credentials.
3. Open the Preview URL supplied by the Vercel check and inspect Home, Explore, both locales and Content studio authentication.
With uploads paused and no release attestation, the configured catalogue correctly remains empty.
4. Review and merge the pull request into the configured Production Branch yourself.
The existing GitHub integration automatically deploys branch pushes and merges according to [Vercel's GitHub documentation](https://vercel.com/docs/git/vercel-for-github).
5. In the existing project's Deployments tab, open the matching Git commit and confirm a Ready Production deployment.
If deployment fails, inspect its build logs and correct the reported configuration before retrying that deployment.
If no automatic deployment appears, use Deployments > Create Deployment in this same project, select the merged production branch or commit, and confirm its environment before creating it.
6. In Settings > Domains, confirm that `healingmuse.vercel.app` belongs to this project and serves the current Production deployment.
A public `404: NOT_FOUND` alone does not establish its dashboard cause; inspect this assignment and the latest Ready deployment.
7. Open [the production homepage](https://healingmuse.vercel.app/vi) and [the public catalogue](https://healingmuse.vercel.app/api/catalog).
Verify HTTPS, security headers and private no-store responses, then repeat the browser and mobile performance checks.
After approved storage delivery and the administrator's attestation, verify all 1,000 release IDs, the final catalogue page and playback at this same origin.
8. Keep the previous deployment available in Vercel for recovery and retain the publication audit.
A deployment rollback does not automatically reverse database publication; compare current recording snapshots before any transactional release recovery.

No Vercel CLI login, Vercel token or duplicate project is needed.
Preview readiness, Production readiness, public domain assignment and deployed performance must be reported from their respective evidence.

## Budget and monitoring

The existing plans are unchanged.
See [storage-options.md](storage-options.md) for the verified Storage capacity gap, current prices and an approval-dependent recommendation.
Review any hosting and transactional email costs separately before approving additional spending.
Set Vercel spend alerts and a hard usage action compatible with pilot availability.
Keep the Supabase spend cap enabled where supported and review egress, database size, Storage size, and Realtime usage weekly.
Limits differ by service, so alerts do not replace checking actual billed usage.
Avoid paid point-in-time recovery or additional projects unless they fit a separately reviewed budget.

Monitor `/api/health` availability and verify a published playback grant from a synthetic probe without logging the URL.
Track fixed `playback_failed`, `authentication_failed`, and `synchronization_failed` categories.
Review aggregated Auth failures and retention-job health without exporting email-level events.

## Launch gate

Run the full acceptance matrix, production build, live authorization checks, load measurements, and isolated recovery rehearsal.
Complete actual screen-reader and mobile device testing.
Complete a small usability review with representative adults and their chosen assistive technology.
Begin participant rollout only after those gates pass.
The local implementation and automated evidence do not by themselves authorize a patient launch.
