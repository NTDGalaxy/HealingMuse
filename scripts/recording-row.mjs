export function recordingRow(track) {
  return {
    id: track.id,
    title: track.title,
    description: track.description ?? { vi: "", en: "" },
    artist: track.artist,
    category: track.category,
    goals: track.goals,
    genres: track.genres || [],
    instruments: track.instruments || [],
    traditions: track.traditions || [],
    duration: track.duration,
    source: track.source,
    download_allowed: track.downloadAllowed,
    artwork: track.artwork,
    color: track.color,
    attribution: track.attribution,
    license: track.license,
    license_url: track.licenseUrl,
    provenance_url: track.provenanceUrl,
    status: "draft",
    rights_verified: false,
    human_created: track.humanCreated,
    listening_reviewed: false,
    position: track.position,
    bytes: track.bytes,
    sha256: track.sha256,
    changes: track.changes ?? "",
  };
}

export function releaseMetadata(track) {
  const row = recordingRow(track);
  delete row.status;
  delete row.rights_verified;
  delete row.listening_reviewed;
  return row;
}
