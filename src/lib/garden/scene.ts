import * as THREE from "three";
import {
  gardens,
  initialQuality,
  lowerQuality,
  type GardenId,
  type GardenTheme,
  type GardenEvent,
} from "./config";

// Original parametric botanical geometry. No remote models, textures or requests.
function petalGeometry(cup = false) {
  const vertices: number[] = [],
    indices: number[] = [];
  const rows = 16,
    columns = 12;
  for (let y = 0; y <= rows; y++) {
    const v = y / rows,
      width = Math.pow(Math.sin(Math.PI * v), 0.7) * (cup ? 0.62 : 0.48);
    for (let x = 0; x <= columns; x++) {
      const u = (x / columns) * 2 - 1;
      vertices.push(
        u * width,
        cup ? Math.pow(v, 1.8) * 0.65 + u * u * width * 0.15 : v * 1.8,
        cup ? v * 1.8 : Math.sin(v * Math.PI * 0.9) * 0.25 + u * u * width * 0.32,
      );
      if (y < rows && x < columns) {
        const a = y * (columns + 1) + x,
          b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function compose(id: GardenId, theme: GardenTheme) {
  const definition = gardens[id],
    night = theme === "night";
  const group = new THREE.Group();
  const colors = night
    ? {
        stone: "#827790",
        leaf: "#66a58c",
        tip: "#add0b7",
        petal: "#d8b5e7",
        gold: "#c9b785",
        water: "#416e80",
      }
    : {
        stone: "#dad2e4",
        leaf: "#2e7357",
        tip: "#6cab83",
        petal: "#dda8cd",
        gold: "#d9ba74",
        water: "#a5cbd3",
      };
  const materials = Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: key === "water" ? 0.25 : 0,
        side: THREE.DoubleSide,
      }),
    ]),
  );
  const geometries = {
    petal: petalGeometry(true),
    leaf: petalGeometry(),
    stem: new THREE.CylinderGeometry(0.025, 0.045, 1, 6),
    seed: new THREE.SphereGeometry(1, 12, 8),
    terrace: new THREE.CylinderGeometry(1, 0.92, 0.18, 64),
    ring: new THREE.TorusGeometry(1, 0.035, 6, 64),
    arch: new THREE.TorusGeometry(1, 0.075, 6, 32, Math.PI),
    trunk: new THREE.CylinderGeometry(0.09, 0.2, 1, 8),
  };
  type GeometryName = keyof typeof geometries;
  const batches = new Map<
    string,
    { geometry: THREE.BufferGeometry; material: THREE.Material; transforms: THREE.Matrix4[] }
  >();
  const dummy = new THREE.Object3D();
  const add = (
    geometry: GeometryName,
    material: string,
    position: number[],
    scale: number[],
    rotation = [0, 0, 0],
  ) => {
    const key = `${geometry}:${material}`;
    if (!batches.has(key))
      batches.set(key, {
        geometry: geometries[geometry],
        material: materials[material],
        transforms: [],
      });
    dummy.position.set(position[0], position[1], position[2]);
    dummy.scale.set(scale[0], scale[1], scale[2]);
    dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
    dummy.updateMatrix();
    batches.get(key)!.transforms.push(dummy.matrix.clone());
  };
  let randomState = definition.seed;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const flower = (x: number, y: number, z: number, size: number, lotus = false) => {
    add("stem", "leaf", [x, y - size * 0.7, z], [size, size * 1.5, size]);
    for (let ring = 0; ring < (lotus ? 3 : 2); ring++) {
      const count = lotus ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + ring * 0.28;
        add(
          "petal",
          "petal",
          [x, y, z],
          [size * (1 - ring * 0.18), size * (1 - ring * 0.15), size],
          [-0.12 - ring * 0.23, angle, 0],
        );
      }
    }
    add("seed", "gold", [x, y + size * 0.16, z], [size * 0.24, size * 0.1, size * 0.24]);
  };
  const fern = (x: number, y: number, z: number, size: number) => {
    for (let frond = 0; frond < 5; frond++) {
      const angle = (frond / 5) * Math.PI * 2;
      for (let i = 0; i < 7; i++) {
        const t = i / 7;
        for (const side of [-1, 1])
          add(
            "leaf",
            i % 2 ? "leaf" : "tip",
            [
              x + Math.sin(angle) * t * size,
              y + Math.sin(t * 2) * size,
              z + Math.cos(angle) * t * size,
            ],
            [size * (1 - t) * 0.32, size * (1 - t) * 0.5, size * 0.4],
            [0.8, angle + side * 0.65, side * 0.6],
          );
      }
    }
  };
  const terraces = definition.form === "bowl" ? 6 : definition.form === "ravine" ? 4 : 3;
  for (let i = 0; i < terraces; i++) {
    const x = i === 0 ? 3.8 : 3.5 + Math.sin(i * 2.2 + definition.seed) * 4,
      z = -i * 4.5,
      y = -1.5 + Math.sin(i + definition.seed) * 0.35;
    const size = i === 0 ? 3 : 2.3;
    add("terrace", "stone", [x, y, z], [size, 1, size]);
    add("terrace", "water", [x, y + 0.1, z], [size * 0.87, 0.3, size * 0.87]);
    add(
      "ring",
      "stone",
      [x, y + 0.18, z],
      [size * 0.93, size * 0.93, size * 0.93],
      [Math.PI / 2, 0, 0],
    );
    if (["arbor", "glasshouse", "gallery", "court"].includes(definition.form)) {
      add("arch", "stone", [x, y + 2.2, z - 1], [1.9, 2.2, 1.9]);
      for (const side of [-1, 1])
        add("trunk", "stone", [x + side * 1.9, y + 1.15, z - 1], [0.65, 2.3, 0.65]);
    }
    if (definition.plant === "lotus" || definition.plant === "flower") {
      flower(x, y + 1.6, z, 1 + random() * 0.3, definition.plant === "lotus");
      flower(x + 1, y + 0.8, z + 0.7, 0.4, definition.plant === "lotus");
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * Math.PI * 2;
        add("leaf", "leaf", [x, y + 0.1, z], [1.2, 1.5, 1], [1.3, a, 0.1]);
      }
    } else if (definition.plant === "fern") {
      fern(x, y + 0.2, z, 1.6);
      fern(x + 1.2, y + 0.1, z + 0.6, 0.8);
    } else if (definition.plant === "wisteria") {
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI;
        for (let k = 0; k < 7; k++)
          add(
            "seed",
            k < 2 ? "tip" : "petal",
            [x + Math.cos(a) * 1.8, y + 2.2 + Math.sin(a) * 2 - k * 0.14, z - 1],
            [0.11 * (1 - k * 0.1), 0.16, 0.11],
          );
      }
      fern(x, y, z, 0.8);
    } else if (definition.plant === "seed") {
      for (let j = 0; j < 7; j++) {
        const a = j * 2.4;
        add("stem", "gold", [x + Math.sin(a), y + 0.8, z + Math.cos(a)], [1, 1.4, 1]);
        add("seed", "tip", [x + Math.sin(a), y + 1.6, z + Math.cos(a)], [0.28, 0.55, 0.28]);
      }
    } else {
      add("trunk", "leaf", [x, y + 1, z], [1, 2, 1]);
      for (let j = 0; j < 8; j++) {
        const a = j * 2.4;
        const cypress = definition.plant === "cypress";
        add(
          "seed",
          "leaf",
          [
            x + (cypress ? 0 : Math.sin(a) * 0.85),
            y + 1.4 + j * (cypress ? 0.25 : 0.08),
            z + (cypress ? 0 : Math.cos(a) * 0.6),
          ],
          [cypress ? 0.7 - j * 0.06 : 0.9, cypress ? 0.7 : 0.3, cypress ? 0.7 - j * 0.06 : 0.7],
        );
      }
    }
  }
  // Distant terraces produce depth without expensive post-processing or shadow maps.
  for (let i = 0; i < 9; i++)
    add(
      "terrace",
      "stone",
      [(random() - 0.5) * 38, -3 - random() * 3, -12 - random() * 20],
      [2 + random() * 3, 8 + random() * 5, 2 + random() * 3],
    );
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.transforms.length);
    batch.transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    group.add(mesh);
  }
  return {
    group,
    detail: (tier: number) =>
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh)
          object.count = Math.max(
            1,
            Math.floor(object.instanceMatrix.count * (tier === 2 ? 1 : tier === 1 ? 0.65 : 0.35)),
          );
      }),
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}

export function createGarden(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
  theme: GardenTheme,
  id: GardenId,
  onEvent: (event: GardenEvent) => void = () => {},
  poster = false,
  lowPower = false,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: poster,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  scene.name = "HealingMuse botanical world";
  const hemisphere = new THREE.HemisphereLight("#fff1fb", "#466c62", 2.5);
  const sun = new THREE.DirectionalLight("#fff2dd", 3.5);
  sun.position.set(-3, 8, 5);
  scene.add(hemisphere, sun);
  let composition: ReturnType<typeof compose>;
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
  const change = (garden: GardenId, nextTheme: GardenTheme) => {
    if (composition) {
      scene.remove(composition.group);
      composition.dispose();
    }
    composition = compose(garden, nextTheme);
    composition.detail(quality.tier);
    scene.add(composition.group);
    const night = nextTheme === "night";
    const fog = night ? "#221c34" : "#dfd8eb";
    scene.background = new THREE.Color(fog);
    scene.fog = new THREE.FogExp2(fog, 0.025);
    hemisphere.intensity = night ? 1.7 : 2;
    sun.intensity = night ? 1.9 : 2.5;
    sun.color.set(night ? "#cbc4ff" : "#fff2dd");
    renderer.render(scene, camera);
  };
  resize(width, height);
  change(id, theme);
  onEvent({ type: "ready" });
  const tick = (now: number) => {
    if (disposed || !visible) return;
    frame = requestAnimationFrame(tick);
    if (now - last < 1000 / quality.fps - 1) return;
    last = now;
    composition.group.rotation.y = Math.sin(now * 0.00008) * 0.018;
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
          onEvent({ type: "still" });
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
    onEvent({ type: "failed" });
  };
  canvas.addEventListener("webglcontextlost", lost);
  return {
    change,
    resize: (w: number, h: number) => {
      width = w;
      height = h;
      resize(w, h);
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
