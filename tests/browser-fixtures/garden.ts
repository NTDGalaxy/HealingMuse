import { createGarden } from "../../src/lib/garden/scene";
import { gardens, type GardenId, type GardenTheme } from "../../src/lib/garden/config";
const params = new URLSearchParams(location.search);
const id = params.get("garden") as GardenId;
const theme: GardenTheme = params.get("theme") === "night" ? "night" : "day";
if (!Object.hasOwn(gardens, id)) throw new Error("Unknown garden fixture");
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
canvas.style.width = "100vw";
canvas.style.height = "100vh";
const renderer = createGarden(canvas, {
  // Posters are supersampled at each tier's cap whatever the capture device: 2 exceeds every cap.
  viewport: { width: innerWidth, height: innerHeight, devicePixelRatio: 2 },
  scene: { garden: id, theme },
  onEvent: (event) => {
    document.documentElement.dataset.state = event.type;
  },
  poster: true,
});
document.documentElement.dataset.state = "ready";
window.addEventListener("pagehide", () => renderer.dispose(), { once: true });
