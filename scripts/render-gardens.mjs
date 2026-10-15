import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const only = process.argv.find((value) => value.startsWith("--only="))?.slice(7);
const ids = only
  ? [only]
  : [
      "lotus",
      "fern",
      "moonflower",
      "wisteria",
      "seed",
      "lily",
      "bonsai",
      "propagation",
      "orchid",
      "cloister",
      "cypress",
      "sculpture",
    ];
const server = await createServer({
  configFile: false,
  optimizeDeps: { entries: ["tests/browser-fixtures/garden.html"] },
  server: { host: "127.0.0.1", port: 3198, strictPort: true },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const receipts = [];
await mkdir("public/gardens", { recursive: true });
try {
  for (const id of ids)
    for (const theme of ["day", "night"])
      for (const width of [480, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: width === 480 ? 1040 : 1000 },
          deviceScaleFactor: 1,
        });
        await page.goto(
          `http://127.0.0.1:3198/tests/browser-fixtures/garden.html?garden=${id}&theme=${theme}`,
        );
        await page.waitForFunction(() => document.documentElement.dataset.state === "ready");
        const png = await page.locator("canvas").screenshot();
        const output = `public/gardens/${id}-${theme}-${width}`;
        await sharp(png).avif({ quality: 48, effort: 5 }).toFile(`${output}.avif`);
        if (width === 1440) await sharp(png).webp({ quality: 75 }).toFile(`${output}.webp`);
        const { stat } = await import("node:fs/promises");
        const bytes = (await stat(`${output}.avif`)).size;
        if (width === 480 && bytes > 81920) throw new Error("Mobile poster budget exceeded");
        receipts.push({ garden: id, theme, width, bytes });
        await page.close();
        console.log(JSON.stringify({ garden: id, theme, width, bytes }));
      }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/garden-posters.json",
    JSON.stringify(
      { renderer: "Three.js", generatedAt: new Date().toISOString(), receipts },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
