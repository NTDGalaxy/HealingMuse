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
 * @typedef {{ readinessMs: number | null, audioMs: number | null, lcpMs: number | null,
 *   cls: number, interactionMs: number, sceneReadyMs: number | null, errors: number }} Observation
 * @typedef {{ samples: number, readinessP95Ms: number | null, audioP95Ms: number | null,
 *   lcpP95Ms: number | null, clsMax: number, interactionP95Ms: number | null,
 *   sceneReadyP95Ms: number | null, sceneMissing: number, errors: number, missingReadiness: number,
 *   missingAudio: number, passed: boolean }} CellSummary
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
    passed,
  };
}
