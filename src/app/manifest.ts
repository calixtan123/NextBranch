import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Northern Direct", short_name: "Northern Direct", description: "Direct Northern line arrivals", start_url: "/", display: "standalone", background_color: "#F7F4EE", theme_color: "#B63A32", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
