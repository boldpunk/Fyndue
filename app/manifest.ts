import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fyndue",
    short_name: "Fyndue",
    description: "Личные финансы: долги, расходы и платежи",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#4f39f6",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
