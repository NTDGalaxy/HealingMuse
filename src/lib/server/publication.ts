import "server-only";
import type { Track } from "@/lib/types";
import { assertDb, HttpError, type requireUser } from "./http";

type Db = Awaited<ReturnType<typeof requireUser>>["db"];

/**
 * Publishing happens only through release review (publish_catalogue_release, which records the
 * human attestation). A track save may keep an already published row published, so metadata edits
 * still work, but it can never move a row into "published". Migration 202611090004 enforces the
 * same rule for direct REST writes.
 */
export async function assertNotPublishing(db: Db, id: string, status: Track["status"]) {
  if (status !== "published") return;
  const { data, error } = await db.from("tracks").select("status").eq("id", id).maybeSingle();
  assertDb(error);
  if (data?.status !== "published") throw new HttpError(403, "forbidden");
}
