import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appearanceBootstrap,
  appearanceKey,
  calmKey,
  parseAppearance,
  parseCalm,
  resolveTheme,
  serializeAppearance,
  serializeCalm,
} from "@/lib/preferences";
import { createPreferencesStore, defaultPreferences } from "@/lib/preferences-store";

// The bootstrap and parser shipped before the preferences module; every stored value must keep
// producing what these produced, so browsers that already saved preferences see no change.
const previousBootstrap = `(function(){try{document.documentElement.dataset.calm=String(localStorage.getItem('healingmuse-calm')==='true');var p=JSON.parse(localStorage.getItem('healingmuse-appearance-v1')||'{}');var a=['day','night'].includes(p.appearance)?p.appearance:'system';document.documentElement.dataset.theme=a==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'night':'day'):a;document.documentElement.dataset.garden=p.garden==='still'?'still':'auto';}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';}})();`;
function previousParse(raw: string | null) {
  let appearance = "system";
  let garden = "auto";
  try {
    const stored = JSON.parse(raw || "{}");
    if (["day", "night"].includes(stored.appearance)) appearance = stored.appearance;
    if (stored.garden === "still") garden = "still";
  } catch {
    /* Defaults. */
  }
  return { appearance, garden };
}
const storedValues = [
  null,
  "",
  "{}",
  "null",
  "5",
  '"night"',
  "[]",
  "{not json",
  JSON.stringify({ appearance: "night", garden: "still" }),
  JSON.stringify({ appearance: "day", garden: "auto" }),
  JSON.stringify({ appearance: "system", garden: "still" }),
  JSON.stringify({ appearance: "dusk", garden: "lush" }),
  JSON.stringify({ garden: "still" }),
  JSON.stringify({ appearance: "night" }),
];
function run(script: string, storage: Record<string, string | null>, dark: boolean) {
  const dataset: Record<string, string> = {};
  const document = { documentElement: { dataset } };
  const localStorage = { getItem: (key: string) => storage[key] ?? null };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && dark,
  });
  new Function("document", "localStorage", "matchMedia", script)(
    document,
    localStorage,
    matchMedia,
  );
  return dataset;
}

describe("stored preference formats", () => {
  it("parses every stored appearance exactly as before", () => {
    for (const raw of storedValues) expect(parseAppearance(raw)).toEqual(previousParse(raw));
  });
  it("serializes to the same bytes the previous provider wrote", () => {
    expect(serializeAppearance({ appearance: "night", garden: "still" })).toBe(
      JSON.stringify({ appearance: "night", garden: "still" }),
    );
    expect(serializeAppearance(parseAppearance(null))).toBe(
      '{"appearance":"system","garden":"auto"}',
    );
    expect(serializeCalm(true)).toBe("true");
    expect(serializeCalm(false)).toBe("false");
    expect([parseCalm("true"), parseCalm("false"), parseCalm(null), parseCalm("1")]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(appearanceKey).toBe("healingmuse-appearance-v1");
    expect(calmKey).toBe("healingmuse-calm");
  });
  it("resolves the system appearance from the device scheme", () => {
    expect(resolveTheme("system", true)).toBe("night");
    expect(resolveTheme("system", false)).toBe("day");
    expect(resolveTheme("day", true)).toBe("day");
  });
});

describe("pre-paint bootstrap", () => {
  it("applies what the previous bootstrap applied for every readable value", () => {
    for (const raw of storedValues)
      for (const calm of [null, "true", "false"])
        for (const dark of [false, true]) {
          const storage = { [appearanceKey]: raw, [calmKey]: calm };
          const before = run(previousBootstrap, storage, dark);
          const after = run(appearanceBootstrap, storage, dark);
          // The previous script gave up on garden and Calm when storage was unreadable JSON;
          // the generated one keeps their defaults instead (no stylesheet reads data-garden).
          if (before.garden === undefined) {
            expect(after).toEqual({ ...before, calm: String(calm === "true"), garden: "auto" });
          } else expect(after).toEqual(before);
          const parsed = parseAppearance(raw);
          expect(after).toEqual({
            calm: String(parseCalm(calm)),
            theme: resolveTheme(parsed.appearance, dark),
            garden: parsed.garden,
          });
        }
  });
  it("still sets a theme when storage is blocked", () => {
    const dataset: Record<string, string> = {};
    new Function("document", "localStorage", "matchMedia", appearanceBootstrap)(
      { documentElement: { dataset } },
      {
        getItem() {
          throw new Error("SecurityError");
        },
      },
      () => ({ matches: true }),
    );
    expect(dataset).toEqual({ calm: "false", theme: "night", garden: "auto" });
  });
  it("uses the storage key the offline shell reads", async () => {
    const offline = await readFile("public/offline/appearance.js", "utf8");
    expect(offline).toContain(JSON.stringify(appearanceKey));
  });
});

type Listener = (event: { key: string | null }) => void;
class FakeMedia extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }
  set(value: boolean) {
    this.matches = value;
    this.dispatchEvent(new Event("change"));
  }
}
describe("preferences store", () => {
  let storage: Map<string, string>;
  let dataset: Record<string, string>;
  let dark: FakeMedia;
  let reduced: FakeMedia;
  let storageListeners: Set<Listener>;
  beforeEach(() => {
    storage = new Map();
    dataset = {};
    dark = new FakeMedia(false);
    reduced = new FakeMedia(false);
    storageListeners = new Set();
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("matchMedia", (query: string) =>
      query === "(prefers-color-scheme: dark)" ? dark : reduced,
    );
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {
      addEventListener: (_type: string, listener: Listener) => storageListeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => storageListeners.delete(listener),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders defaults on the server and starts from the bootstrap values on the client", () => {
    storage.set(appearanceKey, JSON.stringify({ appearance: "night", garden: "still" }));
    storage.set(calmKey, "true");
    Object.assign(dataset, run(appearanceBootstrap, Object.fromEntries(storage), false));
    const store = createPreferencesStore();
    expect(store.getServerSnapshot()).toBe(defaultPreferences);
    expect(store.getSnapshot()).toEqual({
      appearance: "night",
      garden: "still",
      theme: "night",
      calm: true,
      reducedMotion: false,
      saveData: false,
    });
    // Stable between reads, as useSyncExternalStore requires.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
  it("saves appearance and garden in the stored format and updates <html>", () => {
    const store = createPreferencesStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().theme).toBe("day");
    dark.matches = true;
    store.setAppearance("system");
    expect(store.getSnapshot().theme).toBe("night");
    expect(dataset.theme).toBe("night");
    store.setGarden("still");
    expect(storage.get(appearanceKey)).toBe('{"appearance":"system","garden":"still"}');
    expect(dataset.garden).toBe("still");
    store.setAppearance("day");
    expect(dataset.theme).toBe("day");
    expect(storage.get(appearanceKey)).toBe('{"appearance":"day","garden":"still"}');
    expect(listener).toHaveBeenCalledTimes(3);
    store.setAppearance("day");
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it("saves Calm on the device before syncing it, and adopts a profile value without saving", async () => {
    const store = createPreferencesStore();
    const order: string[] = [];
    const stop = store.setCalmSync(async (value) => {
      order.push(`sync:${value}:${storage.get(calmKey)}`);
    });
    await store.setCalm(true);
    expect(order).toEqual(["sync:true:true"]);
    expect(dataset.calm).toBe("true");
    store.adoptCalm(false);
    expect(store.getSnapshot().calm).toBe(false);
    expect(dataset.calm).toBe("false");
    expect(storage.get(calmKey)).toBe("true");
    stop();
    await store.setCalm(true);
    expect(order).toHaveLength(1);
  });
  it("follows the device scheme, reduced motion and other tabs while started", () => {
    const store = createPreferencesStore();
    const stop = store.start();
    expect(dataset).toEqual({ theme: "day", garden: "auto", calm: "false" });
    dark.set(true);
    expect(store.getSnapshot().theme).toBe("night");
    reduced.set(true);
    expect(store.getSnapshot().reducedMotion).toBe(true);
    storage.set(appearanceKey, JSON.stringify({ appearance: "day", garden: "still" }));
    for (const listener of storageListeners) listener({ key: appearanceKey });
    expect(store.getSnapshot()).toMatchObject({ appearance: "day", garden: "still", theme: "day" });
    storage.set(calmKey, "true");
    for (const listener of storageListeners) listener({ key: calmKey });
    expect(store.getSnapshot().calm).toBe(true);
    stop();
    expect(storageListeners.size).toBe(0);
    dark.set(false);
    store.setAppearance("system");
    expect(store.getSnapshot().theme).toBe("day");
  });
});
