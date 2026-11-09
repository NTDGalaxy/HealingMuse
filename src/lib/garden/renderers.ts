// The two renderers behind the controller's port interface. Each owns one canvas inside the
// host element and removes it on dispose. The worker renderer draws through OffscreenCanvas in
// src/lib/garden/worker.ts; the main-thread renderer loads the scene module on demand and starts
// one quality tier lower.
import type { RendererFactory } from "./controller";
import { gardenProtocol, readWorkerMessage, type HostCommand } from "./protocol";
import type { Garden } from "./scene";

function attachCanvas(host: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  return canvas;
}

/** Throws when OffscreenCanvas workers are unavailable, so the controller falls back. */
export function workerRenderer(host: HTMLElement): RendererFactory {
  return ({ scene, viewport }, emit) => {
    const canvas = attachCanvas(host);
    let worker: Worker;
    try {
      if (typeof Worker === "undefined" || !("transferControlToOffscreen" in canvas))
        throw new Error("OffscreenCanvas workers are unavailable");
      const offscreen = canvas.transferControlToOffscreen();
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (message: MessageEvent<unknown>) => emit(readWorkerMessage(message.data));
      worker.onerror = () => emit({ type: "failed" });
      worker.postMessage(
        {
          type: "init",
          protocol: gardenProtocol,
          canvas: offscreen,
          viewport,
          scene,
        } satisfies HostCommand,
        [offscreen],
      );
    } catch (error) {
      canvas.remove();
      throw error;
    }
    const post = (command: HostCommand) => worker.postMessage(command);
    return {
      scene: (spec) => post({ type: "scene", scene: spec }),
      resize: (next) => post({ type: "resize", viewport: next }),
      visible: (value) => post({ type: "visible", value }),
      dispose() {
        worker.terminate();
        canvas.remove();
      },
    };
  };
}

export function mainThreadRenderer(host: HTMLElement): RendererFactory {
  return (init, emit) => {
    const canvas = attachCanvas(host);
    let { scene, viewport } = init;
    let garden: Garden | null = null;
    let disposed = false;
    const fail = () => {
      if (!disposed) emit({ type: "failed" });
    };
    import("./scene").then(({ createGarden }) => {
      if (disposed) return;
      try {
        garden = createGarden(canvas, { viewport, scene, onEvent: emit, lowPower: true });
      } catch {
        return fail();
      }
      emit({ type: "ready" });
    }, fail);
    return {
      scene(spec) {
        scene = spec;
        garden?.change(spec);
      },
      resize(next) {
        viewport = next;
        garden?.resize(next);
      },
      visible: (value) => garden?.visible(value),
      dispose() {
        disposed = true;
        garden?.dispose();
        garden = null;
        canvas.remove();
      },
    };
  };
}
