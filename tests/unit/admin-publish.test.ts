import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertNotPublishing } from "@/lib/server/publication";

const db = (stored: { data: { status: string } | null; error: object | null }) => {
  const maybeSingle = vi.fn(async () => stored);
  const client = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) };
  return client as unknown as Parameters<typeof assertNotPublishing>[0] & typeof client;
};
const id = "10000000-0000-4000-8000-000000000001";

describe("track saves never publish outside release review", () => {
  it("does not look anything up for draft or retired saves", async () => {
    const client = db({ data: null, error: null });
    await assertNotPublishing(client, id, "draft");
    await assertNotPublishing(client, id, "retired");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("refuses to move a new or unpublished track into published", async () => {
    await expect(
      assertNotPublishing(db({ data: null, error: null }), id, "published"),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
    await expect(
      assertNotPublishing(db({ data: { status: "draft" }, error: null }), id, "published"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertNotPublishing(db({ data: { status: "retired" }, error: null }), id, "published"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows metadata edits that keep an already published track published", async () => {
    await expect(
      assertNotPublishing(db({ data: { status: "published" }, error: null }), id, "published"),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the stored status cannot be read", async () => {
    await expect(
      assertNotPublishing(db({ data: null, error: { code: "08006" } }), id, "published"),
    ).rejects.toMatchObject({ status: 503 });
  });
});
