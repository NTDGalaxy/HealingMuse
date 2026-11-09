import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { harness } from "../contracts";
import { t, type Locale, type MessageKey, type MessageValues } from "../i18n";
import { Recordings } from "./track-card";

export type HarnessView =
  "library" | "mood" | "settings" | "admin" | "recording" | "browse" | "catalogue" | "password";

export interface HarnessOptions {
  /** Start without a synthetic session. */
  guest?: boolean;
  /** Synthetic auth outcomes understood by tests/browser-fixtures/auth.ts. */
  flags?: string[];
  locale?: Locale;
}

/**
 * Vite servers for the browser fixtures in tests/browser-fixtures. Each spec starts the one it
 * needs and closes it in `afterAll`; Vite is imported lazily so other specs never load it.
 */
export class FixtureHarness {
  private constructor(private readonly server: ViteDevServer) {}

  /** Real application components with stubbed Supabase, `next/link` and `next/navigation`. */
  static async components(): Promise<FixtureHarness> {
    const { createServer } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    const server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite/personal-features",
      optimizeDeps: { entries: [harness.page] },
      plugins: [react()],
      server: {
        host: "127.0.0.1",
        port: 0,
        // These fixtures are immutable during a run; avoid scanning local media and build output.
        watch: null,
        warmup: { clientFiles: ["tests/browser-fixtures/main.tsx"] },
      },
      resolve: {
        alias: [
          { find: "@/lib/supabase/client", replacement: resolve("tests/browser-fixtures/auth.ts") },
          { find: "next/link", replacement: resolve("tests/browser-fixtures/link.tsx") },
          { find: "next/navigation", replacement: resolve("tests/browser-fixtures/navigation.ts") },
          { find: "@", replacement: resolve("src") },
        ],
      },
      define: {
        "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://synthetic.invalid"),
        "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("synthetic-key"),
      },
    });
    await server.listen();
    return new FixtureHarness(server);
  }

  /** The binaural stereo renderer running in a real OfflineAudioContext. */
  static async binauralAudio(): Promise<FixtureHarness> {
    const { createServer } = await import("vite");
    const server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite/binaural-audio",
      optimizeDeps: { entries: [harness.audioPage] },
      server: { host: "127.0.0.1", port: 0, watch: null },
    });
    await server.listen();
    return new FixtureHarness(server);
  }

  get origin() {
    return this.server.resolvedUrls!.local[0];
  }

  url({ guest, flags = [], locale }: HarnessOptions = {}) {
    const query = [...(guest ? ["guest"] : []), ...flags, ...(locale ? [`locale=${locale}`] : [])];
    return `${this.origin}${harness.page}${query.length ? `?${query.join("&")}` : ""}`;
  }

  get audioUrl() {
    return `${this.origin}${harness.audioPage}`;
  }

  async close() {
    await this.server.close();
  }
}

/** The component harness screen switcher and the application components it renders. */
export class HarnessScreens {
  readonly recordings: Recordings;

  constructor(
    readonly page: Page,
    readonly harness: FixtureHarness,
    readonly locale: Locale = "en",
  ) {
    this.recordings = new Recordings(page, locale);
  }

  t(key: MessageKey, values?: MessageValues) {
    return t(this.locale, key, values);
  }

  async open(options: HarnessOptions = {}) {
    await this.page.goto(this.harness.url(options));
  }
  /** The harness button that renders one application view. */
  view(name: HarnessView) {
    return this.page.getByRole("button", { name, exact: true });
  }
  async show(name: HarnessView) {
    await this.view(name).click();
  }
  /** The harness's own Sign in trigger in its screen switcher. */
  get signIn() {
    return this.page.getByRole("navigation").getByRole("button", {
      name: harness.signIn,
      exact: true,
    });
  }
  get namedSignIn() {
    return this.page
      .getByRole("navigation", { name: harness.navigation })
      .getByRole("button", { name: harness.signIn, exact: true });
  }
  get dialog() {
    return this.page.getByRole("dialog");
  }
  /** A button by message key, matched exactly. */
  button(key: MessageKey, values?: MessageValues) {
    return this.page.getByRole("button", { name: this.t(key, values), exact: true });
  }
  /** Supabase auth methods the stubbed client received, in order. */
  authCalls() {
    return this.page.evaluate(() => window.__syntheticAuthCalls);
  }
  /** The redirect path the stubbed client received for password recovery. */
  recoveryPath() {
    return this.page.evaluate(() => window.__syntheticRecoveryPath);
  }
}
