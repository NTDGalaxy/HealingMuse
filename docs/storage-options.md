# Recording storage options

Prices checked on 11 October 2026 (Asia/Saigon) are in US dollars before tax, additional projects and optional services.
The user confirmed that the existing Supabase organization uses the Free plan and requested that remaining uploads stay paused.
No subscription, paid resource, migration or additional upload was initiated.

## Capacity and pricing

The 1,000 eligible recordings occupy 4,638,015,135 bytes, approximately 4.64 decimal GB.
Existing cloud objects occupy 73,480,982 bytes, leaving 4,564,534,153 bytes to deliver.
The two retired shortened recordings remain excluded.

| Option | Included storage | Base storage cost for this inventory | Transfer and operations |
| --- | --- | --- | --- |
| Existing Supabase Free | 1 GB | Insufficient capacity | Existing plan limits still apply |
| Supabase Pro | 100 GB | From $25/month for the organization with the first project included | 250 GB ordinary egress and 250 GB cached egress included; overages $0.09/GB and $0.03/GB respectively |
| Cloudflare R2 Standard | 10 GB-month free each month | $0 within the included allowance, assuming no other account usage exhausts it | Internet egress free; 1 million Class A and 10 million Class B operations included monthly |

Supabase storage beyond its Pro allowance costs $0.0213/GB-month.
Additional projects, compute sizes and other usage can increase the actual bill; confirm the owning dashboard's estimate before approving an upgrade.
See [Supabase pricing](https://supabase.com/pricing).

R2 Standard overages cost $0.015/GB-month, $4.50 per million Class A operations and $0.36 per million Class B operations, with billable-unit rounding.
Its free allowance is account-wide and applies to Standard storage.
An initial 1,000-object upload is comfortably below the operation allowance, while seeks, HEAD requests and playback each consume operations and should be measured.
No separate Worker, custom domain or paid CDN is included in this estimate.
See [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Engineering implications

Supabase Pro preserves the implemented private bucket, server-issued playback grants, resumable delivery receipts and release transaction that locks Supabase Storage object versions.
It offers the simplest robust path to this particular release because storage authorization and publication verification already share the existing project.
My recommendation is Pro if the owner approves its recurring organization cost.
That recommendation is an engineering judgment based on the current implementation and has not been executed.

R2 is a credible lower-cost alternative for the recording files while Supabase continues to handle authentication and application data.
Keep the R2 bucket private and issue short-lived server-side GET grants after fresh publication and rights checks.
Cloudflare documents [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) for temporary object access without exposing API credentials.
Range playback, CORS, URL expiry, download rights and service-worker exclusions need browser verification.

The current release transaction is deliberately tied to Supabase Storage objects.
R2 therefore requires a new provider-aware delivery model and migration, immutable checksum-addressed objects, protected deletion or replacement paths, and an explicit consistency boundary between external storage verification and database publication.
Do not change the applied release migration or substitute an R2 URL into an existing Supabase delivery receipt.
Preserve all recording IDs, audio hashes, attribution and existing Supabase objects during any approved transition.
R2 adoption also leaves the existing Supabase Free database and authentication plan limits in place.
The Free project can pause after inactivity, whereas Pro includes daily database backups and avoids inactivity pausing.
Confirm whether those availability and recovery differences meet the pilot requirements.

## Approval and resumption

Keep delivery paused until the owner chooses and approves an option.
If Pro is selected, the owner upgrades the existing organization in its dashboard, verifies the actual invoice estimate and available capacity, and leaves supported spend controls enabled.
Then configure the verified upload capacity privately, resume the existing draft-delivery workflow and register the manifest after all receipts pass.
If R2 is selected, implement and validate the provider change before creating delivery receipts or publishing the release.
Billing-enabled account setup and any paid services require the owner's approval.
Neither storage approval nor administrator designation substitutes for the administrator's named release attestation.
