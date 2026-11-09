// One decision for decorative motion, derived from the device preferences. The garden scene, its
// poster and the GSAP layer all follow it, so Calm, reduced motion, Still and Save-Data mean the
// same thing everywhere. Reduced transparency is not an input: it swaps translucent surfaces for
// opaque fills in CSS and changes no motion.
import type { PreferencesSnapshot } from "./preferences-store";

export type MotionPolicy = Readonly<{
  /** The live 3D scene may run; otherwise the still poster shows. */
  scene: boolean;
  /** GSAP content reveals and the scenery fade-in may run. */
  reveals: boolean;
  /** The scenery may drift with scrolling. */
  parallax: boolean;
}>;

type MotionInputs = Pick<PreferencesSnapshot, "calm" | "reducedMotion" | "garden" | "saveData">;

// One frozen object per outcome, so equal policies are the same value (a stable store snapshot).
const policies = new Map<string, MotionPolicy>();

export function motionPolicy({
  calm,
  reducedMotion,
  garden,
  saveData,
}: MotionInputs): MotionPolicy {
  const still = garden === "still";
  const reveals = !calm && !reducedMotion;
  const scene = reveals && !still && !saveData;
  const parallax = reveals && !still;
  const key = `${scene}:${reveals}:${parallax}`;
  let policy = policies.get(key);
  if (!policy) policies.set(key, (policy = Object.freeze({ scene, reveals, parallax })));
  return policy;
}
