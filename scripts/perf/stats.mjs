// @ts-check
// Pure statistics for the timed gate. Nearest-rank percentiles, as the previous harness used.

/**
 * @param {number[]} values
 * @param {number} p fraction in (0, 1]
 * @returns {number | null}
 */
export function percentile(values, p) {
  const present = values.filter((value) => Number.isFinite(value));
  if (!present.length) return null;
  const sorted = [...present].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

/**
 * Where the garden scene started relative to the play tap and the first sound (audio-first start).
 * Reported, never gated: "after-audio" is the intended order once a play is pending, and
 * "before-tap" means the scene had already started when the play was tapped.
 * @typedef {"after-audio" | "before-audio" | "before-tap" | "no-scene" | "no-audio" | "no-tap"} SceneOrder
 * @param {{ clickMs: number, audioAtMs: number, sceneStartMs: number | null }} times
 *   page-clock times; 0 means the tap or the sound did not happen
 * @returns {SceneOrder}
 */
export function sceneOrder({ clickMs, audioAtMs, sceneStartMs }) {
  if (!clickMs) return "no-tap";
  if (sceneStartMs === null) return "no-scene";
  if (sceneStartMs < clickMs) return "before-tap";
  if (!audioAtMs) return "no-audio";
  return sceneStartMs >= audioAtMs ? "after-audio" : "before-audio";
}

/**
 * @typedef {{ readinessMs: number | null, audioMs: number | null, lcpMs: number | null,
 *   cls: number, interactionMs: number, sceneReadyMs: number | null, errors: number,
 *   sceneOrder?: SceneOrder }} Observation
 * @typedef {{ samples: number, readinessP95Ms: number | null, audioP95Ms: number | null,
 *   lcpP95Ms: number | null, clsMax: number, interactionP95Ms: number | null,
 *   sceneReadyP95Ms: number | null, sceneMissing: number, errors: number, missingReadiness: number,
 *   missingAudio: number, sceneOrder: Partial<Record<SceneOrder, number>>, passed: boolean }} CellSummary
 */

/**
 * @param {Observation[]} observations
 * @param {{ audio: boolean, thresholdMs: number, minSamples: number }} rule
 * @returns {CellSummary}
 */
export function summarize(observations, rule) {
  const pick = (/** @type {keyof Observation} */ key) =>
    observations.map((observation) => /** @type {number} */ (observation[key]));
  const readinessP95Ms = percentile(pick("readinessMs"), 0.95);
  const audioP95Ms = rule.audio ? percentile(pick("audioMs"), 0.95) : null;
  const missingReadiness = observations.filter((o) => o.readinessMs === null).length;
  const missingAudio = rule.audio ? observations.filter((o) => o.audioMs === null).length : 0;
  /** @type {Partial<Record<SceneOrder, number>>} */
  const order = {};
  for (const { sceneOrder: value } of observations)
    if (value) order[value] = (order[value] ?? 0) + 1;
  const passed =
    observations.length >= rule.minSamples &&
    missingReadiness === 0 &&
    missingAudio === 0 &&
    readinessP95Ms !== null &&
    readinessP95Ms <= rule.thresholdMs &&
    (!rule.audio || (audioP95Ms !== null && audioP95Ms <= rule.thresholdMs));
  return {
    samples: observations.length,
    readinessP95Ms,
    audioP95Ms,
    lcpP95Ms: percentile(pick("lcpMs"), 0.95),
    clsMax: Math.max(0, ...pick("cls")),
    interactionP95Ms: percentile(pick("interactionMs"), 0.95),
    sceneReadyP95Ms: percentile(pick("sceneReadyMs"), 0.95),
    sceneMissing: observations.filter((o) => o.sceneReadyMs === null).length,
    errors: observations.reduce((sum, o) => sum + o.errors, 0),
    missingReadiness,
    missingAudio,
    sceneOrder: order,
    passed,
  };
}
