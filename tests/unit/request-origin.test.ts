import { describe, it, expect } from "vitest";
import { hasSameOrigin } from "@/lib/request-origin";

describe("mutation origin verification", () => {
  const request = (host: string, origin: string, url = "https://internal.invalid/api/me") =>
    new Request(url, { headers: { host, origin } });

  it("accepts the browser authority through a different listener address", () => {
    expect(
      hasSameOrigin(
        request("localhost:3011", "http://localhost:3011", "http://0.0.0.0:3011/api/me"),
      ),
    ).toBe(true);
    expect(hasSameOrigin(request("healingmuse.vercel.app", "https://healingmuse.vercel.app"))).toBe(
      true,
    );
    expect(
      hasSameOrigin(request("healingmuse.vercel.app:443", "https://healingmuse.vercel.app")),
    ).toBe(true);
    expect(
      hasSameOrigin(request("[::1]:3011", "http://[::1]:3011", "http://[::]:3011/api/me")),
    ).toBe(true);
  });

  it("rejects different schemes, ports, lookalike domains and non-origin URLs", () => {
    for (const origin of [
      "http://healingmuse.vercel.app",
      "https://healingmuse.vercel.app:8443",
      "https://healingmuse.vercel.app.attacker.invalid",
      "https://attacker-healingmuse.vercel.app",
      "https://healingmuse.vercel.app/path",
      "https://healingmuse.vercel.app/",
      "null",
    ])
      expect(hasSameOrigin(request("healingmuse.vercel.app", origin))).toBe(false);
  });

  it("rejects missing or malformed authority and source headers", () => {
    for (const host of [
      "",
      "attacker.invalid@healingmuse.vercel.app",
      "healingmuse.vercel.app/path",
      "healingmuse.vercel.app?query",
      "healingmuse.vercel.app#fragment",
      "healingmuse.vercel.app,attacker.invalid",
      "%68ealingmuse.vercel.app",
      "healingmuse.vercel.app:invalid",
    ])
      expect(hasSameOrigin(request(host, "https://healingmuse.vercel.app"))).toBe(false);
    expect(hasSameOrigin(request("healingmuse.vercel.app", ""))).toBe(false);
    expect(hasSameOrigin(new Request("https://healingmuse.vercel.app/api/me"))).toBe(false);
  });

  it("does not trust client-supplied forwarded authority headers", () => {
    const submitted = request("healingmuse.vercel.app", "https://attacker.invalid");
    submitted.headers.set("x-forwarded-host", "attacker.invalid");
    submitted.headers.set("forwarded", "host=attacker.invalid;proto=https");
    expect(hasSameOrigin(submitted)).toBe(false);
  });
});
