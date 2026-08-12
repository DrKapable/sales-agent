import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "MedMinds Sales Agent",
    short_name: "MedMinds Agent",
    description: "MedMinds sales, client support and business intelligence workspace.",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#f6fbfb",
    theme_color: "#203952",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
    ],
    shortcuts: [
      {
        name: "Agent Admin",
        short_name: "Admin",
        description: "Open the MedMinds client inbox and lead workspace.",
        url: "/admin",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }]
      },
      {
        name: "Business Intelligence",
        short_name: "Intelligence",
        description: "Open lead analytics, operations and Ask Intelligence.",
        url: "/admin/business",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }]
      },
      {
        name: "MedMinds Assistant",
        short_name: "Assistant",
        description: "Open the public MedMinds sales assistant.",
        url: "/",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }]
      }
    ]
  };
}
