// Budget markers. scripts/check-budgets.mjs counts every emitted chunk that contains one of these
// strings toward the graphics limit (three.js and GSAP are found by their own markers there).
// Each module embeds its marker as a string literal, checked against this table by the
// `satisfies GraphicsMarker<...>` at the use site: an imported constant would stay in this
// module's chunk instead of the graphics chunk. The budget check fails when a marker matches no
// emitted chunk, and tests/unit/check-budgets.test.ts fails when a marker appears anywhere else.
// Keep this module free of imports and non-erasable syntax: the budget script loads it natively.

export const graphicsMarkers = {
  scene: {
    marker: "healingmuse-graphics:scene",
    label: "garden scenes",
    module: "src/lib/garden/scene.ts",
  },
  worker: {
    marker: "healingmuse-graphics:worker",
    label: "garden worker",
    module: "src/lib/garden/worker.ts",
  },
  motion: {
    marker: "healingmuse-graphics:motion",
    label: "GSAP garden motion",
    module: "src/components/garden-motion.tsx",
  },
} as const;

export type GraphicsMarker<K extends keyof typeof graphicsMarkers> =
  (typeof graphicsMarkers)[K]["marker"];
