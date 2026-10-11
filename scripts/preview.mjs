import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
const mode = process.argv.includes("--build")
  ? "build"
  : process.argv.includes("--production")
    ? "start"
    : "dev";
const port = process.env.PREVIEW_PORT || "3000";
const output = ".next-preview";
if (mode === "build") await import("./build-shell.mjs");
if (mode === "start") {
  const build = await readFile(`${output}/BUILD_ID`, "utf8").catch(() => null);
  const preview = await readFile(`${output}/healingmuse-preview-build`, "utf8").catch(() => null);
  if (!build || build !== preview)
    throw new Error("Run npm run build:preview before starting the isolated production preview.");
}
const args = [
  "node_modules/next/dist/bin/next",
  mode,
  ...(mode === "build" ? [] : ["--hostname", "0.0.0.0", "--port", port]),
];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    LOCAL_CATALOG_ENABLED: "true",
    HEALINGMUSE_PREVIEW: "true",
  },
});
child.on("exit", async (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  if (mode === "build" && code === 0) {
    try {
      await writeFile(
        `${output}/healingmuse-preview-build`,
        await readFile(`${output}/BUILD_ID`, "utf8"),
      );
    } catch {
      console.error("The isolated preview build did not produce a complete build marker.");
      process.exitCode = 1;
    }
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
