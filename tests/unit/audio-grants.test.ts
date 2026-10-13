import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signed: vi.fn(),
  getTrack: vi.fn(),
  rateLimit: vi.fn(),
  grant: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  privilegedClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.signed }) },
  }),
}));
vi.mock("@/lib/server/catalog", () => ({
  getTrack: mocks.getTrack,
  localCatalogEnabled: () => false,
}));
vi.mock("@/lib/server/http", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/http")>();
  return { ...original, rateLimit: mocks.rateLimit };
});
import { audioGrant } from "@/lib/server/audio-storage";
import { GET } from "@/app/api/grants/[id]/route";
import type { Track } from "@/lib/types";
const track = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "published",
  source: { kind: "hosted", path: "fixture.mp3" },
  downloadAllowed: false,
  sha256: "a".repeat(64),
  bytes: 100,
} as Track;
beforeEach(() => {
  vi.clearAllMocks();
});
it("public grants freshly check publication and download rights before resolving storage", async () => {
  mocks.getTrack.mockResolvedValue(null);
  const context = { params: Promise.resolve({ id: track.id }) };
  expect(
    (await GET(new Request(`https://healingmuse.vercel.app/api/grants/${track.id}`), context))
      .status,
  ).toBe(404);
  mocks.getTrack.mockResolvedValue(track);
  expect(
    (
      await GET(
        new Request(`https://healingmuse.vercel.app/api/grants/${track.id}?download=1`),
        context,
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.signed).not.toHaveBeenCalled();
});
it("a missing B2 receipt fails closed rather than issuing a Supabase URL", async () => {
  mocks.rpc.mockResolvedValue({ data: { provider: "b2", unavailable: true }, error: null });
  await expect(audioGrant(track)).rejects.toMatchObject({ status: 503, code: "unavailable" });
  expect(mocks.signed).not.toHaveBeenCalled();
});
it("preserves the existing grant contract and private response headers for legacy objects", async () => {
  mocks.getTrack.mockResolvedValue(track);
  mocks.rpc.mockResolvedValue({ data: { provider: "supabase" }, error: null });
  mocks.signed.mockResolvedValue({
    data: { signedUrl: "https://synthetic.invalid/private" },
    error: null,
  });
  const response = await GET(new Request(`https://healingmuse.vercel.app/api/grants/${track.id}`), {
    params: Promise.resolve({ id: track.id }),
  });
  expect(response.status).toBe(200);
  expect(Object.keys(await response.json()).sort()).toEqual([
    "bytes",
    "expiresAt",
    "sha256",
    "url",
  ]);
  expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(mocks.signed).toHaveBeenCalledWith("fixture.mp3", 600);
});
