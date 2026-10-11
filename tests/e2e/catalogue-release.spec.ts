import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { CatalogPage, Track } from "@/lib/types";

test("release requests preserve same-origin authentication and reject cross-site submissions", async ({
  page,
  request,
}) => {
  const payload = {
    releaseId: "20000000-0000-4000-8000-000000000001",
    manifestHash: "a".repeat(64),
    reviewerName: "Synthetic unauthorized reviewer",
    attestationVersion: "human-review-v1",
    listeningConfirmed: true,
    rightsConfirmed: true,
    provenanceConfirmed: true,
  };
  const authorization = await request.get("/api/admin/releases");
  expect([401, 503]).toContain(authorization.status());
  await page.goto("/en/admin");
  const sameOrigin = await page.evaluate(async (data) => {
    const response = await fetch("/api/admin/releases/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: response.status, cache: response.headers.get("cache-control") };
  }, payload);
  expect(sameOrigin.status).toBe(authorization.status());
  expect(sameOrigin.cache).toContain("no-store");
  const invalid = await page.evaluate(async (data) => {
    const response = await fetch("/api/admin/releases/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, reviewerId: data.releaseId }),
    });
    return response.status;
  }, payload);
  expect(invalid).toBe(400);
  for (const origin of ["https://attacker.invalid", "null"]) {
    const denied = await request.post("/api/admin/releases/publish", {
      headers: { Origin: origin, "X-Forwarded-Host": "attacker.invalid" },
      data: payload,
    });
    expect(denied.status()).toBe(403);
  }
});

test("the prepared release is discoverable through every bounded page and ID lookup", async ({
  request,
}) => {
  const prepared: Track[] = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
  const eligible = prepared.filter((track) => track.status !== "retired");
  let cursor: string | null = null;
  const seen = new Set<string>();
  let last: Track | undefined;
  do {
    const response = await request.get(
      `/api/catalog?${new URLSearchParams({ limit: "48", ...(cursor ? { cursor } : {}) })}`,
    );
    expect(response.ok()).toBe(true);
    const page: CatalogPage = await response.json();
    expect(page.total).toBe(eligible.length);
    expect(page.items.length).toBeLessThanOrEqual(48);
    expect(Object.keys(page).sort()).toEqual(["items", "nextCursor", "total"]);
    for (const track of page.items) {
      expect(seen.has(track.id)).toBe(false);
      seen.add(track.id);
    }
    last = page.items.at(-1);
    cursor = page.nextCursor;
  } while (cursor);
  expect([...seen].sort()).toEqual(eligible.map((track) => track.id).sort());
  expect(last).toBeDefined();
  const lookup = await request.get(`/api/tracks?ids=${last!.id}`);
  expect(lookup.ok()).toBe(true);
  expect((await lookup.json())[0].id).toBe(last!.id);
  for (const track of prepared.filter((track) => track.status === "retired"))
    expect(seen.has(track.id)).toBe(false);
  const invalid = await request.get("/api/catalog?limit=49");
  expect(invalid.status()).toBe(400);
});
