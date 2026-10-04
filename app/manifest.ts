import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fyndue",
    short_name: "Fyndue",
    description: "Личные финансы: долги, подписки и платежи",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#4f39f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
