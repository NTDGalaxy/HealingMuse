# Architecture and access boundaries

One Next.js application holds catalog, playback, personal library, wellbeing, and administration modules.
Next.js 16 App Router and React 19 render the interface with strict TypeScript, Tailwind CSS 4, and next-intl.
Node.js 22 is required locally, in CI, and on Vercel.
Supabase supplies Postgres, passwordless Auth, private Storage, and private Realtime Broadcast.

## Data access

| Actor | Published catalog | Own library | Own consented mood | Another patient's mood | Draft content |
| --- | --- | --- | --- | --- | --- |
| Guest | Read and play | None | None | None | None |
| Patient | Read and play | Read and mutate | Read and mutate | None | None |
| Content administrator | Read and play | Own account only | Own account only | None | Manage |
| Server credential | Only through authorized operations | Own verified deletion or rate limit | No reporting interface | No reporting interface | Import outside runtime |

The `content_admins` membership table is inaccessible to clients.
Every content operation verifies both authentication and the administrator membership RPC.
Account deletion always targets the freshly verified caller.
The private Storage bucket has no guest or patient object-read policy.
Playback grants are issued for published hosted tracks with a ten-minute expiry.
Draft preview grants require content administration authorization.
Hosted audio streams directly from Storage in configured deployments.
Local preview audio is registered by catalog ID and supports single byte ranges.
The local preview route disables itself when a Supabase URL is configured.

## Personal mutations

RLS restricts profiles, favorites, playlists, playlist items, sessions, and check-ins to their owner.
Playlist edits use a locked transactional RPC and reject outdated revisions with HTTP 409.
Consent changes and paired check-ins use owner-checking RPCs.
Check-in RPCs lock the Auth identity, consent profile, and session in a consistent order to serialize them with consent revocation and account erasure.
Personal mutation requests carry the initiating account ID and reject a different freshly verified identity.
Account changes cancel pending check-in work, clear dialogs, and discard the previous account's playlist queue.
Clients cannot insert arbitrary mood records or bypass the explicit consent workflow.
Read policies hide records older than 90 days even before the daily physical deletion job runs.
Account deletion cascades through application records.
An inaccessible deletion ledger supports reapplying erasures after an isolated restore.

Database triggers send only an invalidation scope to the private `user:<uuid>` Broadcast topic.
Channel authorization checks the authenticated user's topic.
No mood score, email, playlist title, token, or playback URL is broadcast.
The client refetches on subscription, reconnection, network return, and focus return.
Expired or changed sessions are verified again on the server.

## Playback and offline storage

A persistent layout owns a single native audio element.
Playback position and timer deadlines remain local to the player.
Track transitions reject obsolete grants through a generation counter.
There are no database writes for playback ticks.
External media is separate from the hosted queue.
YouTube is loaded only after explicit user initiation and remains visible inside its dialog.
Spotify links use its ordinary website without tokens or API integration.

Downloaded recordings store an MP3 Blob, public metadata, attribution, timestamp, and byte count in IndexedDB.
The downloader validates size and the imported SHA-256 checksum before committing atomically.
Interrupted downloads never create partial recording entries.
Private account data and mood values are not persisted for offline use.
The service worker caches only an allowlisted public shell and falls back to the dedicated offline library when navigation cannot reach the server.
It does not cache Next.js HTML, API responses, signed URLs, or streamed audio.
The offline shell supports native audio, deletion, credits, and a local timer.
Operating-system suspension may delay JavaScript timer execution, so locked-device behavior must be verified and documented before rollout.

## Operations and privacy

Application logs contain fixed error categories rather than bodies, emails, mood values, or signed URLs.
Provider infrastructure has its own operational logging and access controls.
Review access and retention in the owning Vercel, Supabase, and SMTP accounts.
Keep credentials in server environments and never use `NEXT_PUBLIC_` for privileged values.
The application does not infer legal jurisdictional compliance from its technical privacy controls.
