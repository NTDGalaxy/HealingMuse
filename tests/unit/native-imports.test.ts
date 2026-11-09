import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// Ops scripts import these TypeScript modules with Node's native type stripping, without a
// bundler. They must stay erasable syntax with relative imports only (no "@/" aliases).
const modules = [
  "src/lib/routes.ts",
  "src/lib/preferences.ts",
  "src/lib/validation.ts",
  "src/lib/storage/b2.ts",
];

describe("modules loaded natively by Node scripts", () => {
  for (const file of modules)
    it(`${file} imports under plain Node`, () => {
      const url = pathToFileURL(resolve(file)).href;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
        { encoding: "utf8" },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    });
});
