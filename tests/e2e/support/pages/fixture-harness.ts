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
    const { startFixtureServer } = await import("../../../browser-fixtures/server.mjs");
    const { server } = await startFixtureServer({
      cacheDir: "node_modules/.vite/personal-features",
    });
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
  private readonly requested: string[] = [];

  constructor(
    readonly page: Page,
    readonly harness: FixtureHarness,
    readonly locale: Locale = "en",
  ) {
    this.recordings = new Recordings(page, locale);
    // Recorded from construction, before the first navigation, so no early request is missed.
    page.on("request", (request) => this.requested.push(new URL(request.url()).pathname));
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
  /** The harness control that switches the rendered locale without a page load. */
  get switchLanguage() {
    return this.page.getByRole("button", { name: harness.switchLanguage, exact: true });
  }
  /** Auth listeners and Realtime channels the stubbed client has handed out. */
  subscriptions() {
    return this.page.evaluate(() => window.__syntheticSubscriptions);
  }
  /** Delivers a Realtime broadcast to every subscribed synthetic channel. */
  async broadcast(event: string) {
    await this.page.evaluate((event) => window.__syntheticBroadcast(event), event);
  }
  /** How often this page has requested a source module (a path from `harness.modules`). */
  moduleRequests(module: string) {
    return this.requested.filter((path) => path === `/${module}`).length;
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
