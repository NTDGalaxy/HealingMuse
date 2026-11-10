import * as THREE from "three";
import { gardens, initialQuality, lowerQuality, type GardenId, type GardenTheme } from "./config";
import type { GraphicsMarker } from "./budget-markers";
import type { SceneEvent, SceneSpec, SceneTint, Viewport } from "./protocol";

// Original procedural light forms drawn by one shared interpreter: no remote models, textures or
// requests. Motion is ambient and slow, tens of seconds per cycle; nothing follows the beat.

/** The app's grounds, so the scene fades into the page under the wash. */
const grounds = { day: "#f5f1fa", night: "#12091a" } as const;
const defaults = {
  day: { glow: "#8d6bdc", mid: "#b9a3e3", accent: "#0b7f63" },
  night: { glow: "#c9b6f0", mid: "#8d6bdc", accent: "#3fe0b5" },
} as const;

function seeded(seed: number) {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

type Composition = {
  group: THREE.Group;
  /** Shows the parts allowed at a detail tier (2 is full detail). */
  detail(tier: number): void;
  /** Places every moving part at a time in seconds. */
  animate(seconds: number): void;
  dispose(): void;
};

function compose(id: GardenId, theme: GardenTheme, tint?: SceneTint): Composition {
  const { form, seed } = gardens[id];
  const random = seeded(seed);
  const night = theme === "night";
  const palette = defaults[theme];
  const glow = new THREE.Color(tint?.glow ?? palette.glow);
  const mid = new THREE.Color(tint?.mid ?? palette.mid);
  const accent = new THREE.Color(palette.accent);
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const tiers: THREE.Object3D[][] = [[], [], []];
  const animators: ((seconds: number) => void)[] = [];
  const keep = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };
  const light = (color: THREE.Color, strength = 1) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: (night ? 0.9 : 0.35) * strength,
      roughness: 0.35,
      metalness: 0.15,
    });
    materials.push(material);
    return material;
  };
  const stroke = (color: THREE.Color, opacity = 0.8) => {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      // Lines need more weight on the light day ground to read at all.
      opacity: Math.min(1, night ? opacity : opacity * 1.7),
    });
    materials.push(material);
    return material;
  };
  const add = (object: THREE.Object3D, tier = 0) => {
    group.add(object);
    tiers[tier].push(object);
    return object;
  };
  const center = new THREE.Vector3(2.5, 2.4, -4);

  switch (form) {
    case "rings": {
      // Concentric halos around one point, turning at different slow speeds.
      for (let index = 0; index < 9; index++) {
        const radius = 2 + index * 0.75 + random() * 0.3;
        const color = index % 3 === 2 ? accent : index % 2 ? mid : glow;
        const ring = new THREE.Mesh(
          keep(new THREE.TorusGeometry(radius, 0.035 + random() * 0.03, 8, 160)),
          light(color, index % 3 === 2 ? 1.2 : 0.8),
        );
        ring.position.copy(center);
        ring.rotation.set(Math.PI / 3 + random() * 0.2, random() * 0.3, 0);
        add(ring, index < 5 ? 0 : index < 7 ? 1 : 2);
        const speed = 0.02 + random() * 0.03;
        animators.push((seconds) => {
          ring.rotation.z = seconds * speed;
        });
      }
      break;
    }
    case "meter": {
      // A row of levels on an arc, like a meter at rest.
      const count = 56;
      const bars = new THREE.InstancedMesh(
        keep(new THREE.BoxGeometry(0.16, 1, 0.16)),
        light(glow, 0.8),
        count,
      );
      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      for (let index = 0; index < count; index++) {
        const height = 0.6 + random() * 4.2;
        const angle = -0.9 + (index / (count - 1)) * 1.8;
        matrix.compose(
          new THREE.Vector3(
            center.x + Math.sin(angle) * 9,
            height / 2 - 0.5,
            center.z - 7 + Math.cos(angle) * 3,
          ),
          new THREE.Quaternion(),
          new THREE.Vector3(1, height, 1),
        );
        bars.setMatrixAt(index, matrix);
        bars.setColorAt(
          index,
          color.copy(index % 7 === 3 ? accent : glow).lerp(mid, (index % 5) / 8),
        );
      }
      add(bars);
      animators.push((seconds) => {
        bars.rotation.y = Math.sin(seconds * 0.04) * 0.06;
      });
      break;
    }
    case "waves": {
      // Two slow wave trains meeting: the lines of a quiet interference pattern.
      const rows = 22,
        points = 120;
      const lines: { line: THREE.Line; row: number }[] = [];
      for (let row = 0; row < rows; row++) {
        const geometry = keep(new THREE.BufferGeometry());
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(new Float32Array(points * 3), 3),
        );
        const color = row % 4 === 0 ? accent : row % 2 ? mid : glow;
        const line = new THREE.Line(geometry, stroke(color, 0.35 + (row / rows) * 0.5));
        add(line, row % 3 === 2 ? 1 : 0);
        lines.push({ line, row });
      }
      const draw = (seconds: number) => {
        for (const { line, row } of lines) {
          const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
          const z = -10 + row * 0.6;
          for (let point = 0; point < points; point++) {
            const x = -12 + (point / (points - 1)) * 28;
            const y =
              1.2 +
              Math.sin(x * 0.45 + seconds * 0.12 + row * 0.2) * 0.6 +
              Math.sin(x * 0.31 - seconds * 0.09 + row * 0.35) * 0.6;
            position.setXYZ(point, x, y, z);
          }
          position.needsUpdate = true;
        }
      };
      draw(0);
      animators.push(draw);
      break;
    }
    case "orbits": {
      // Bodies travelling slowly on tilted orbits around a quiet core.
      for (let index = 0; index < 4; index++) {
        const rx = 3 + index * 1.6,
          ry = 1.2 + index * 0.6;
        const curve = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2);
        const pivot = new THREE.Group();
        pivot.position.copy(center);
        pivot.rotation.set(Math.PI / 2.4, -0.35 + random() * 0.7, 0);
        pivot.add(
          new THREE.LineLoop(
            keep(new THREE.BufferGeometry().setFromPoints(curve.getPoints(180))),
            stroke(index % 2 ? mid : glow, 0.8),
          ),
        );
        const body = new THREE.Mesh(
          keep(new THREE.IcosahedronGeometry(0.22 + random() * 0.18, 2)),
          light(index === 1 ? accent : glow, 1.3),
        );
        pivot.add(body);
        add(pivot, index < 3 ? 0 : 1);
        const speed = 0.03 + random() * 0.03,
          phase = random() * Math.PI * 2;
        animators.push((seconds) => {
          const angle = phase + seconds * speed;
          body.position.set(Math.cos(angle) * rx, Math.sin(angle) * ry, 0);
        });
      }
      const core = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.9, 3)), light(mid, 0.9));
      core.position.copy(center);
      add(core);
      break;
    }
    case "grid": {
      // A field of blocks breathing in long, overlapping swells.
      const columns = 18,
        rows = 10,
        count = columns * rows;
      const cubes = new THREE.InstancedMesh(
        keep(new THREE.BoxGeometry(0.36, 0.36, 0.36)),
        light(glow, 0.7),
        count,
      );
      const matrix = new THREE.Matrix4(),
        color = new THREE.Color(),
        scale = new THREE.Vector3(),
        position = new THREE.Vector3(),
        rotation = new THREE.Quaternion();
      for (let index = 0; index < count; index++)
        cubes.setColorAt(
          index,
          color.copy((index * 7) % 11 === 0 ? accent : glow).lerp(mid, ((index * 3) % 5) / 6),
        );
      const draw = (seconds: number) => {
        for (let index = 0; index < count; index++) {
          const column = index % columns,
            row = Math.floor(index / columns);
          const height =
            0.5 +
            Math.sin(column * 0.5 + seconds * 0.15) * 0.4 +
            Math.cos(row * 0.6 - seconds * 0.11) * 0.4;
          position.set(-6 + column * 0.9, height, -12 + row * 0.9);
          scale.set(1, Math.max(0.2, height * 2), 1);
          cubes.setMatrixAt(index, matrix.compose(position, rotation, scale));
        }
        cubes.instanceMatrix.needsUpdate = true;
      };
      draw(0);
      add(cubes);
      animators.push(draw);
      break;
    }
    case "ripples": {
      // Rings spreading slowly across still water and fading as they widen.
      const rings: THREE.LineLoop[] = [];
      for (let index = 0; index < 10; index++) {
        const curve = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2);
        const loop = new THREE.LineLoop(
          keep(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160))),
          stroke(index % 3 === 0 ? accent : glow, 0.6),
        );
        loop.rotation.x = -Math.PI / 2;
        loop.position.set(center.x, 0.2, center.z);
        add(loop, index < 6 ? 0 : 1);
        rings.push(loop);
      }
      const draw = (seconds: number) =>
        rings.forEach((loop, index) => {
          const radius = 1 + ((index * 1.2 + seconds * 0.25) % 12);
          loop.scale.set(radius, radius, 1);
          (loop.material as THREE.LineBasicMaterial).opacity = 0.7 * (1 - radius / 13);
        });
      draw(0);
      animators.push(draw);
      break;
    }
    default: {
      // prisms: faceted lights drifting and turning slowly.
      for (let index = 0; index < 11; index++) {
        const prism = new THREE.Mesh(
          keep(new THREE.OctahedronGeometry(0.5 + random() * 0.9, 0)),
          light(index % 4 === 0 ? accent : index % 2 ? mid : glow, 0.9),
        );
        prism.position.set(
          center.x - 6 + random() * 12,
          0.8 + random() * 4.5,
          center.z - 4 + random() * 6,
        );
        add(prism, index < 6 ? 0 : index < 9 ? 1 : 2);
        const spin = 0.04 + random() * 0.05,
          bob = random() * Math.PI * 2,
          y = prism.position.y;
        animators.push((seconds) => {
          prism.rotation.set(seconds * spin, seconds * spin * 0.7, 0);
          prism.position.y = y + Math.sin(seconds * 0.2 + bob) * 0.15;
        });
      }
    }
  }
  return {
    group,
    detail(tier) {
      tiers.forEach((objects, index) =>
        objects.forEach((object) => (object.visible = index <= tier)),
      );
    },
    animate(seconds) {
      for (const animate of animators) animate(seconds);
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

export type GardenOptions = {
  viewport: Viewport;
  scene: SceneSpec;
  /** Runtime reports; the caller announces readiness once createGarden returns. */
  onEvent?: (event: SceneEvent) => void;
  /** Draw single frames on demand (poster rendering) instead of animating. */
  poster?: boolean;
  /** Start one quality tier lower (the main-thread fallback). */
  lowPower?: boolean;
};
export type Garden = ReturnType<typeof createGarden>;

/** Builds the renderer and draws the first frame; throws when WebGL is unavailable. */
export function createGarden(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  { viewport, scene: spec, onEvent = () => {}, poster = false, lowPower = false }: GardenOptions,
) {
  let { width, height } = viewport;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: poster,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  scene.name = "healingmuse-graphics:scene" satisfies GraphicsMarker<"scene">;
  const hemisphere = new THREE.HemisphereLight("#f4eefb", "#2a1744", 1.2);
  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(-3, 8, 5);
  scene.add(hemisphere, key);
  let composition: Composition;
  let quality = lowPower ? lowerQuality(initialQuality(width < 700))! : initialQuality(width < 700),
    visible = true,
    disposed = false,
    frame = 0,
    last = 0,
    count = 0,
    windowStart = 0,
    slowWindows = 0;
  const resize = (w: number, h: number) => {
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(w < 700 ? -0.2 : -1.5, 4.8, w < 700 ? 19 : 16);
    camera.lookAt(w < 700 ? 3 : 1, w < 700 ? 2.6 : 0.5, -2);
    camera.updateProjectionMatrix();
  };
  const change = ({ garden, theme, tint }: SceneSpec) => {
    if (composition) {
      scene.remove(composition.group);
      composition.dispose();
    }
    composition = compose(garden, theme, tint);
    composition.detail(quality.tier);
    // Place moving parts at their start, so the first frame and the posters show them.
    composition.animate(0);
    scene.add(composition.group);
    const ground = grounds[theme];
    scene.background = new THREE.Color(ground);
    scene.fog = new THREE.FogExp2(ground, theme === "night" ? 0.03 : 0.035);
    hemisphere.intensity = theme === "night" ? 0.9 : 1.6;
    key.intensity = theme === "night" ? 1 : 1.8;
    renderer.render(scene, camera);
  };
  resize(width, height);
  change(spec);
  const tick = (now: number) => {
    if (disposed || !visible) return;
    frame = requestAnimationFrame(tick);
    if (now - last < 1000 / quality.fps - 1) return;
    last = now;
    composition.animate(now / 1000);
    composition.group.position.y = Math.sin(now * 0.00022) * 0.035;
    renderer.render(scene, camera);
    count++;
    if (!windowStart) windowStart = now;
    if (now - windowStart >= 3000) {
      const fps = (count * 1000) / (now - windowStart);
      slowWindows = fps < Math.min(20, quality.fps * 0.7) ? slowWindows + 1 : 0;
      if (slowWindows >= 2) {
        const next = lowerQuality(quality);
        if (!next) {
          onEvent({ type: "exhausted" });
          cancelAnimationFrame(frame);
          return;
        }
        quality = next;
        composition.detail(quality.tier);
        renderer.setPixelRatio(quality.pixelRatio);
        renderer.setSize(width, height, false);
        // Draw less distant geometry and reduce fill cost at lower tiers.
        camera.far = quality.tier === 1 ? 45 : 30;
        camera.updateProjectionMatrix();
        onEvent({ type: "quality", tier: quality.tier });
        slowWindows = 0;
      }
      count = 0;
      windowStart = now;
    }
  };
  if (!poster) frame = requestAnimationFrame(tick);
  const lost = (event: Event) => {
    event.preventDefault();
    onEvent({ type: "lost" });
  };
  canvas.addEventListener("webglcontextlost", lost);
  return {
    change,
    resize: (next: Viewport) => {
      width = next.width;
      height = next.height;
      resize(width, height);
      if (poster) renderer.render(scene, camera);
    },
    visible: (value: boolean) => {
      visible = value;
      cancelAnimationFrame(frame);
      count = 0;
      windowStart = 0;
      last = 0;
      if (visible && !disposed && !poster) frame = requestAnimationFrame(tick);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      composition.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
