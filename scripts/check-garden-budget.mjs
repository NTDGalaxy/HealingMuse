import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const build = process.argv.find((value) => value.startsWith("--dir="))?.slice(6) || ".next";
async function files(path) {
  return (
    await Promise.all(
      (await readdir(path, { withFileTypes: true })).map((entry) =>
        entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)],
      ),
    )
  ).flat();
}
const chunks = [];
for (const path of await files(join(build, "static"))) {
  if (!path.endsWith(".js")) continue;
  const bytes = await readFile(path);
  // Count emitted vendor, worker and application chunks, including any shared code
  // in those chunks. Never estimate the budget from compressed TypeScript source.
  if (
    /THREE\.|ScrollTrigger|healingmuse-garden-|HealingMuse botanical world/.test(bytes.toString())
  )
    chunks.push({ path: path.replace(`${build}/`, ""), gzipBytes: gzipSync(bytes).length });
}
if (!chunks.length) throw new Error("No compiled garden chunks found");
const posters = [];
for (const path of await files("public/gardens"))
  if (path.endsWith("-480.avif")) posters.push({ path, bytes: (await stat(path)).size });
const gzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
const report = {
  budgetBytes: 220 * 1024,
  gzipBytes,
  chunks,
  mobilePosterBudgetBytes: 80 * 1024,
  mobilePosters: posters,
  passed:
    gzipBytes <= 220 * 1024 &&
    posters.length >= 24 &&
    posters.every((poster) => poster.bytes <= 80 * 1024),
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/garden-budget.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
