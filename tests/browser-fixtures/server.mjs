// @ts-check
// Vite server for the personal-feature fixture (tests/browser-fixtures/index.html): real
// src/components with stubbed Supabase auth, next/link and next/navigation. Shared by the
// personal-features spec and the local visual-equivalence oracle (scripts/visual).
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * Starts the fixture server on a free local port.
 * @param {{ cacheDir: string }} options cacheDir keeps each caller's pre-bundled dependencies apart.
 * @returns {Promise<{ server: import("vite").ViteDevServer, origin: string }>} origin ends with "/".
 */
export async function startFixtureServer({ cacheDir }) {
  const server = await createServer({
    configFile: false,
    cacheDir,
    optimizeDeps: { entries: ["tests/browser-fixtures/index.html"] },
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
  const origin = server.resolvedUrls?.local[0];
  if (!origin) throw new Error("The fixture server did not report a local URL.");
  return { server, origin };
}
