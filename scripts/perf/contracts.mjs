// @ts-check
// Per-route readiness contracts for the timed 3 s gate. Routes come from the single registry.
import { routes } from "../../src/lib/routes.ts";

/**
 * primary: a visible, hydrated, enabled [data-primary] control (src/lib/perf/readiness.ts).
 * shell: the hm:shell-ready mark (navigation hydrated) for pages whose task is reading.
 * audio: media = first `playing` event after a tap; webaudio = first non-silent output sample.
 * @typedef {{ key: string, segment: string, kind: "primary" | "shell", audio: "media" | "webaudio" | null }} Contract
 */

/** @type {Record<string, Omit<Contract, "key" | "segment">>} */
const byKey = {
  home: { kind: "primary", audio: "media" },
  explore: { kind: "primary", audio: "media" },
  binaural: { kind: "primary", audio: "webaudio" },
  library: { kind: "primary", audio: null },
  downloads: { kind: "shell", audio: null },
  mood: { kind: "primary", audio: null },
  settings: { kind: "primary", audio: null },
  admin: { kind: "primary", audio: null },
  resetPassword: { kind: "primary", audio: null },
  privacy: { kind: "shell", audio: null },
  terms: { kind: "shell", audio: null },
  credits: { kind: "shell", audio: null },
};

/** @type {Contract[]} */
export const contracts = routes.map((entry) => {
  const contract = byKey[entry.key];
  if (!contract) throw new Error(`No readiness contract for route ${entry.key}`);
  return { key: entry.key, segment: entry.segment, ...contract };
});

/** @param {string} locale @param {Contract} contract */
export const pathFor = (locale, contract) =>
  contract.segment ? `/${locale}/${contract.segment}` : `/${locale}`;
