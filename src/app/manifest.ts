import type { MetadataRoute } from "next";

/** "Install" the intranet on a phone or desktop (home-screen app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GMX Group Intranet",
    short_name: "GMX Intranet",
    description: "Departments, tools, people and news for GMX Group.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#009f67",
    icons: [
      { src: "/brand/gmx-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/gmx-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/gmx-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
