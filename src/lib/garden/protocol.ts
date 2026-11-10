// Typed, versioned messages between the garden host (main thread) and the renderer worker.
// The init command is the handshake: it carries the host's protocol version, and the worker
// answers anything else with a failure. Both sides ship in the same build, so a mismatch can only
// mean a stale cached worker; the host treats it, and any message it cannot read, as a renderer
// failure, which falls back to the main-thread renderer or the still poster.
import type { GardenId, GardenTheme, QualityTier } from "./config";

/** Bump whenever a message shape changes. */
export const gardenProtocol = 2;

/** The playing recording's artwork colours, which the scene's light takes on. */
export type SceneTint = Readonly<{ glow: string; mid: string }>;
export type SceneSpec = Readonly<{ garden: GardenId; theme: GardenTheme; tint?: SceneTint }>;
/** Scene size in CSS pixels. */
export type Viewport = Readonly<{ width: number; height: number }>;

/** Host to renderer. */
export type HostCommand =
  | {
      type: "init";
      protocol: number;
      canvas: OffscreenCanvas;
      viewport: Viewport;
      scene: SceneSpec;
    }
  | { type: "resize"; viewport: Viewport }
  | { type: "scene"; scene: SceneSpec }
  | { type: "visible"; value: boolean };

/** What a running scene reports about itself. */
export type SceneEvent =
  /** Sustained slow frames stepped quality down to this tier (it never steps back up). */
  | { type: "quality"; tier: QualityTier }
  /** Still too slow at the lowest tier: the poster should replace the scene. */
  | { type: "exhausted" }
  /** The WebGL context was lost. */
  | { type: "lost" };

/** Renderer to host: the first frame is drawn, setup or a command failed, or a scene event. */
export type RendererEvent = { type: "ready" } | { type: "failed" } | SceneEvent;

/** Every message the worker posts. */
export type WorkerMessage = Readonly<{ source: string; protocol: number; event: RendererEvent }>;

const failed: RendererEvent = { type: "failed" };
const tiers: readonly unknown[] = [0, 1, 2] satisfies QualityTier[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isTier(value: unknown): value is QualityTier {
  return tiers.includes(value);
}

/** The worker's side of the handshake. */
export function compatible(command: Extract<HostCommand, { type: "init" }>): boolean {
  return command.protocol === gardenProtocol;
}

/** Reads a worker message; another protocol version or an unknown shape reads as a failure. */
export function readWorkerMessage(data: unknown): RendererEvent {
  if (!isRecord(data) || data.protocol !== gardenProtocol || !isRecord(data.event)) return failed;
  const event = data.event;
  switch (event.type) {
    case "ready":
    case "failed":
    case "exhausted":
    case "lost":
      return { type: event.type };
    case "quality":
      return isTier(event.tier) ? { type: "quality", tier: event.tier } : failed;
    default:
      return failed;
  }
}
