// Readiness contract for the timed 3 s gate (scripts/perf). Each interactive route renders exactly
// one primary control with data-primary; once React has hydrated that element its ref callback
// adds data-hydrated and records a performance mark. No React internals are involved, and a
// streamed but not yet hydrated duplicate can never look ready.

export const readinessMarks = {
  shell: "hm:shell-ready",
  player: "hm:player-ready",
  primary: "hm:primary-ready",
  /** The Shell has preloaded the on-demand dialog code (after the primary mark and first sound). */
  onDemand: "hm:on-demand-ready",
} as const;

export function markOnce(name: string) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  if (performance.getEntriesByName(name, "mark").length) return;
  performance.mark(name);
}

/** Ref callback for a route's primary control. */
export function primaryControlRef(node: HTMLElement | null) {
  if (!node) return;
  node.dataset.hydrated = "";
  markOnce(readinessMarks.primary);
}

/** Spread onto the primary control: renders data-primary on the server and proves hydration. */
export function primaryControl(active = true) {
  return active ? { "data-primary": "", ref: primaryControlRef } : {};
}
