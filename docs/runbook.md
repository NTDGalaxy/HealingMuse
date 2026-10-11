# Maintenance, rollback, and recovery

## Routine operation

Check availability, playback failures, email-code failures, synchronization errors, and daily retention jobs each working day during the pilot.
Review usage and spending alerts weekly.
Review dependency advisories and install compatible security patches with the full validation suite.
Use Node.js 22 consistently.
Inspect both languages and phone layouts after interface changes.
Reproduce reported defects through the closest practical end-user journey before editing code.
Keep the regression journey with the fix.

## Content incident

Retire the affected recording in Content studio.
New playback and download grants will stop being issued.
Existing signed grants can remain valid for their short expiry interval.
Already downloaded copies remain on the user's device and cannot be remotely removed while offline.
Tell the pilot organizer when a rights issue requires participant guidance or removal of local copies.
Preserve license evidence and originals while investigating.
Replace recordings using new immutable paths rather than overwriting an existing file.

## Playback or authentication incident

Check the provider dashboards and fixed application error categories.
Test a synthetic guest recording and a synthetic email-code account.
Check grant expiry, Storage availability, CORS, email delivery, sender-domain verification, and Auth rate limits.
Never paste signed URLs, email addresses, tokens, request bodies, or mood values into incident tickets or logs.
Avoid retry storms and restore service before widening the participant group.
Keep downloaded listening available during connectivity outages.

## Release and rollback

Deploy to staging first and complete the relevant acceptance journeys.
Keep the preceding successful Vercel deployment available for instant application rollback.
Use additive database migrations that work with the preceding application version.
On application failure, promote the preceding deployment and verify guest playback, sign-in, private library, and downloads.
Do not drop personal tables or reverse privacy deletions as a rollback step.
Restore a database only when corruption or data loss warrants it and only after the isolated rehearsal succeeds.
The build derives the public shell revision from authored offline assets and translations.
Run `node scripts/build-shell.mjs` or the production build to regenerate it, and never manually edit the generated worker.
Let the new worker wait for existing sessions or offer a user-initiated update after listening.
Do not interrupt audio automatically to activate an update.

## Backup coverage

Supabase database backups include database records and Storage metadata, while audio objects require separate backups.
See [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).
Keep encrypted offsite copies of audio originals, prepared MP3 files, source evidence, attribution, import reports, and hashes.
Keep a separate current export of the deletion ledger so a restored database does not resurrect erased accounts.
Limit application database exports to an approved retention window of at most 90 days and expire them securely.
Provider backup retention is separate from the application's active mood-history retention.
Restrict backup access to the owning operators, with no content-administrator access to private exports.

## Restoration rehearsal

Restore a synthetic database backup into an isolated staging project or Supabase branch.
Keep outbound participant email disabled and use synthetic identities.
Check the schema, tracked migrations, indexes, roles, policies, cron jobs, and extensions after restoration.
Reapply account deletions from the separate current ledger before exposing the restored system.
Remove sessions and check-ins older than 90 days before permitting application reads.
Verify that erased accounts and their cascaded records do not return.
Restore missing audio objects from the separate archive, then compare every object to its prepared SHA-256 hash.
Do not substitute newly normalized files when the original prepared bytes are available.
Run patient A, patient B, guest, and content-administrator isolation checks against the restored service.
Test real playback and eligible downloads before switching any traffic.
Record recovery time, backup age, exact evidence, operator, and remaining limitations without private patient details.

`node scripts/recovery-check.mjs` exercises a portable synthetic database archive and verifies separate local originals.
That command does not claim to test the managed Supabase restore workflow.
The live managed rehearsal must be completed and recorded before participant rollout.
