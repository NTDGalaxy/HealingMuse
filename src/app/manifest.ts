import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HealingMuse",
    short_name: "HealingMuse",
    description: "Music for a quieter moment",
    start_url: "/vi",
    scope: "/",
    display: "standalone",
    background_color: "#f3eff7",
    theme_color: "#236553",
    lang: "vi",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
