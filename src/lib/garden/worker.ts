// OffscreenCanvas renderer. Speaks src/lib/garden/protocol.ts: the init command is the handshake,
// and every reply is an enveloped RendererEvent.
import { createGarden, type Garden } from "./scene";
import {
  compatible,
  gardenProtocol,
  type HostCommand,
  type RendererEvent,
  type WorkerMessage,
} from "./protocol";

let garden: Garden | undefined;
const post = (event: RendererEvent) =>
  self.postMessage({
    source: "healingmuse-garden-worker",
    protocol: gardenProtocol,
    event,
  } satisfies WorkerMessage);

self.onmessage = ({ data: command }: MessageEvent<HostCommand>) => {
  try {
    switch (command.type) {
      case "init":
        if (!compatible(command)) return post({ type: "failed" });
        garden = createGarden(command.canvas, {
          viewport: command.viewport,
          scene: command.scene,
          onEvent: post,
        });
        return post({ type: "ready" });
      case "resize":
        return garden?.resize(command.viewport);
      case "scene":
        return garden?.change(command.scene);
      case "visible":
        return garden?.visible(command.value);
    }
  } catch {
    post({ type: "failed" });
  }
};
