import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authStorageKey } from "../../src/lib/supabase/config";

describe("Supabase storage key", () => {
  it("is the name supabase-js gives the session cookie and its cross-tab channel", () => {
    for (const url of ["https://abcdefghijklmnop.supabase.co", "http://synthetic.invalid"]) {
      const client = createClient(url, "sb_publishable_test-placeholder", {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      // The client keeps the key it reads and writes the session under, and names its
      // BroadcastChannel after it; session.ts must recognise both without loading the client.
      const { storageKey } = client.auth as unknown as { storageKey: string };
      expect(authStorageKey(url)).toBe(storageKey);
    }
  });
  it("is absent without a valid project URL", () => {
    expect(authStorageKey("")).toBeNull();
    expect(authStorageKey("not a url")).toBeNull();
  });
});
