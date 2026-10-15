import { createGarden } from "./scene";
import type { GardenCommand } from "./config";
let garden: ReturnType<typeof createGarden> | undefined;
self.onmessage = (event: MessageEvent<GardenCommand>) => {
  try {
    const command = event.data;
    if (command.type === "init")
      garden = createGarden(
        command.canvas,
        command.width,
        command.height,
        command.theme,
        command.garden,
        (message) => self.postMessage({ ...message, source: "healingmuse-garden-worker" }),
      );
    else if (command.type === "resize") garden?.resize(command.width, command.height);
    else if (command.type === "scene") garden?.change(command.garden, command.theme);
    else if (command.type === "visible") garden?.visible(command.value);
    else if (command.type === "dispose") {
      garden?.dispose();
      self.close();
    }
  } catch {
    self.postMessage({ type: "failed" });
  }
};
